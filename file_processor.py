# file_processor.py

import os
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct
from langchain_huggingface import HuggingFaceEmbeddings
import uuid

from docx import Document as DocxDocument
import fitz  # PyMuPDF
import io

# Setup
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
QDRANT_COLLECTION_NAME = "my_text_files_collection"
EMBEDDING_MODEL = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

def ensure_qdrant_collection_exists(client, collection_name: str, vector_size: int = 384):
    collections = [c.name for c in client.get_collections().collections]
    if collection_name not in collections:
        client.recreate_collection(
            collection_name=collection_name,
            vectors_config={"size": vector_size, "distance": "Cosine"}
        )

def process_and_store_file(file_stream, filename):
    extension = filename.split('.')[-1].lower()
    text = ""

    if extension == "txt":
        text = file_stream.read().decode("utf-8")

    elif extension == "pdf":
        text = extract_text_from_pdf(file_stream)

    elif extension == "docx":
        text = extract_text_from_docx(file_stream)

    else:
        raise ValueError("Unsupported file type: " + extension)

    if not text.strip():
        raise ValueError("No readable text extracted.")

    # Split text into small chunks if needed (you can improve this later)
    chunks = [text[i:i+500] for i in range(0, len(text), 500)]

    embeddings = EMBEDDING_MODEL.embed_documents(chunks)

    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=vector,
            payload={"filename": filename, "text": chunk}
        ) for chunk, vector in zip(chunks, embeddings)
    ]

    client.upsert(collection_name=QDRANT_COLLECTION_NAME, points=points)
    print(f"Stored {len(points)} vectors for {filename}")

def extract_text_from_pdf(file_stream) -> str:
    doc = fitz.open(stream=file_stream.read(), filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
    return text

def extract_text_from_docx(file_stream) -> str:
    doc = DocxDocument(file_stream)
    return "\n".join([para.text for para in doc.paragraphs])
