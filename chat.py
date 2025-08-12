# chat.py
from dotenv import load_dotenv
load_dotenv()

import os, uuid
from typing import List, Dict, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from db import get_db, SessionLocal
from models import Chat as ChatModel, Message as MessageModel
from auth import get_current_user, UserOut

from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance
from langchain_qdrant import QdrantVectorStore
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.messages import HumanMessage, AIMessage, BaseMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_groq import ChatGroq
from file_processor import process_and_store_file

router = APIRouter()

QDRANT_COLLECTION_NAME = "my_text_files_collection"
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
llm = None
conversational_rag_chain = None

# in-memory cache just for fast prompt context (optional)
chat_sessions: Dict[str, List[BaseMessage]] = {}

class MessageContent(BaseModel):
  text: str

class Message(BaseModel):
  role: str
  content: List[MessageContent]

class ChatRequest(BaseModel):
  message: str
  chat_id: Optional[str] = None

class NewChatIn(BaseModel):
  title: Optional[str] = "New chat"

class RenameChatIn(BaseModel):
  chat_id: str
  title: str

def ensure_qdrant_collection_exists(client: QdrantClient, name: str, vector_size: int = 384):
  existing = [c.name for c in client.get_collections().collections]
  if name not in existing:
    client.recreate_collection(
      collection_name=name,
      vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE)
    )

async def init_rag_chain():
  global llm, conversational_rag_chain
  groq_key = os.getenv("GROQ_API_KEY")
  if not groq_key:
    raise RuntimeError("Missing GROQ_API_KEY")

  llm = ChatGroq(
    api_key=groq_key,
    model_name="llama3-8b-8192",
    temperature=0.7,
    max_tokens=1024,
    streaming=True
  )

  qdrant_key = os.getenv("QDRANT_API_KEY", None)
  client = QdrantClient(url=QDRANT_URL, api_key=qdrant_key)
  ensure_qdrant_collection_exists(client, QDRANT_COLLECTION_NAME)
  vectorstore = QdrantVectorStore(
    client=client,
    collection_name=QDRANT_COLLECTION_NAME,
    embedding=embeddings
  )

  retriever = vectorstore.as_retriever(search_kwargs={"k": 3})
  history_aware_retriever = create_history_aware_retriever(
    llm,
    retriever,
    ChatPromptTemplate.from_messages([
      MessagesPlaceholder(variable_name="chat_history"),
      ("user", "{input}"),
      ("user", "Given the above conversation, generate a search query.")
    ])
  )

  document_chain = create_stuff_documents_chain(
    llm,
    ChatPromptTemplate.from_messages([
      ("system", "You are a helpful AI. Answer based only on this context:\n\n{context}"),
      MessagesPlaceholder(variable_name="chat_history"),
      ("user", "{input}")
    ])
  )

  conversational_rag_chain = create_retrieval_chain(
    history_aware_retriever,
    document_chain
  )

def _first_words(s: str, n: int = 8) -> str:
  return ' '.join((s or '').strip().split()[:n])

def _load_history_as_langchain(db: Session, chat_id: str) -> List[BaseMessage]:
  msgs = (
    db.query(MessageModel)
      .filter(MessageModel.chat_id == chat_id)
      .order_by(MessageModel.created_at.asc())
      .all()
  )
  history: List[BaseMessage] = []
  for m in msgs:
    if m.sender == 'user':
      history.append(HumanMessage(content=m.content))
    else:
      history.append(AIMessage(content=m.content))
  return history

@router.post("/chat/new")
def create_chat(payload: NewChatIn, current: UserOut = Depends(get_current_user), db: Session = Depends(get_db)):
  chat = ChatModel(user_id=current.id, title=payload.title or "New chat")
  db.add(chat); db.commit(); db.refresh(chat)
  chat_sessions[str(chat.id)] = []  # optional: seed memory cache
  return {"id": str(chat.id), "title": chat.title}

@router.post("/chat/rename")
def rename_chat(payload: RenameChatIn, current: UserOut = Depends(get_current_user), db: Session = Depends(get_db)):
  chat = db.get(ChatModel, payload.chat_id)
  if not chat or chat.user_id != current.id:
    raise HTTPException(status_code=404, detail="Chat not found")
  chat.title = payload.title.strip() or chat.title
  db.commit()
  return {"id": str(chat.id), "title": chat.title}

@router.get("/chats")
def list_chats(current: UserOut = Depends(get_current_user), db: Session = Depends(get_db)):
  rows = (
    db.query(ChatModel)
      .filter(ChatModel.user_id == current.id)
      .order_by(ChatModel.created_at.desc())
      .all()
  )
  return [{"id": str(c.id), "title": c.title, "created_at": c.created_at} for c in rows]

@router.get("/chat/{chat_id}")
def get_chat_history(chat_id: str, current: UserOut = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Message]:
  chat = db.get(ChatModel, chat_id)
  if not chat or chat.user_id != current.id:
    raise HTTPException(status_code=404, detail="Chat not found")
  msgs = (
    db.query(MessageModel)
      .filter(MessageModel.chat_id == chat_id)
      .order_by(MessageModel.created_at.asc())
      .all()
  )
  return [
    Message(role=m.sender, content=[MessageContent(text=m.content)])
    for m in msgs
  ]

@router.post("/chat/stream")
async def stream_chat(req: ChatRequest, current: UserOut = Depends(get_current_user), db: Session = Depends(get_db)):
  if conversational_rag_chain is None:
    raise HTTPException(status_code=503, detail="RAG chain not ready")

  # ensure chat exists & ownership
  chat_id = req.chat_id
  if not chat_id:
    chat = ChatModel(user_id=current.id, title=_first_words(req.message, 8))
    db.add(chat); db.commit(); db.refresh(chat)
    chat_id = str(chat.id)
    chat_sessions[chat_id] = []
  else:
    chat = db.get(ChatModel, chat_id)
    if not chat or chat.user_id != current.id:
      raise HTTPException(status_code=404, detail="Chat not found")

  # persist user message
  db.add(MessageModel(chat_id=chat_id, sender='user', content=req.message)); db.commit()

  # build history from DB for better continuity
  history = _load_history_as_langchain(db, chat_id)
  chat_sessions[chat_id] = history  # keep cache in sync

  async def gen():
    # use a fresh session in the generator's lifecycle
    local_db = SessionLocal()
    answer_acc = ""
    try:
      async for chunk in conversational_rag_chain.astream({
        "input": req.message,
        "chat_history": history
      }):
        if "answer" in chunk:
          part = chunk["answer"]
          answer_acc += part
          yield part
    finally:
      # persist assistant message when stream completes/aborts
      try:
        if answer_acc.strip():
          local_db.add(MessageModel(chat_id=chat_id, sender='assistant', content=answer_acc))
          local_db.commit()
      except Exception:
        local_db.rollback()
      finally:
        local_db.close()

  return StreamingResponse(gen(), media_type="text/plain")

@router.post("/upload")
async def upload_files(files: List[UploadFile] = File(...), current: UserOut = Depends(get_current_user)):
  if not files:
    raise HTTPException(status_code=400, detail="No files provided.")
  for f in files:
    process_and_store_file(f.file, f.filename)
  return {"message": f"Uploaded {len(files)} files successfully."}
