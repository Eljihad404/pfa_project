# main.py
import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth import router as auth_router
from chat import router as chat_router, init_rag_chain
from admin import router as admin_router
from docs import router as docs_router  # ← ADD THIS

load_dotenv()

app = FastAPI(title="RAG Chatbot API", version="1.0.0", docs_url="/api-docs", redoc_url=None)

# CORS
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    await init_rag_chain()

# Routers
app.include_router(docs_router, prefix="/docs", tags=["docs"])  # /docs now serves your API
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(admin_router)

@app.get("/")
def root():
    return {"message": "RAG Chatbot API is running."}
