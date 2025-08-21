# langchain_store.py
import os
import uuid
from typing import List, Dict

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
)

# LangChain imports across versions
try:
    from langchain_huggingface import HuggingFaceEmbeddings  # newer LC
except Exception:
    from langchain.embeddings import HuggingFaceEmbeddings  # older LC

# --------------------
# Config
# --------------------
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")  # optional
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "jesa_docs")
EMBED_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
DISTANCE = os.getenv("EMBED_DISTANCE", "COSINE").upper()  # COSINE | DOT | EUCLID

# --------------------
# Clients
# --------------------
client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
embeddings = HuggingFaceEmbeddings(model_name=EMBED_MODEL)


def _embedding_dim() -> int:
    """
    Be robust to LC version changes:
    - try .client.get_sentence_embedding_dimension()
    - try .model.get_sentence_embedding_dimension()
    - fallback: len(embed_query("probe"))
    """
    for attr in ("client", "model"):
        try:
            st = getattr(embeddings, attr)
            return st.get_sentence_embedding_dimension()
        except Exception:
            pass
    return len(embeddings.embed_query("dimension probe"))


def _ensure_collection() -> None:
    dim = _embedding_dim()
    # If collection exists, leave it
    try:
        client.get_collection(QDRANT_COLLECTION)
        return
    except Exception:
        pass

    dist_map = {"COSINE": Distance.COSINE, "DOT": Distance.DOT, "EUCLID": Distance.EUCLID}
    client.create_collection(
        collection_name=QDRANT_COLLECTION,
        vectors_config=VectorParams(size=dim, distance=dist_map.get(DISTANCE, Distance.COSINE)),
    )


_ensure_collection()

# --------------------
# Public API
# --------------------
def upsert_document(doc_id: str, chunks: List[str], metadata: Dict):
    """
    Embed chunks and upsert to Qdrant. Uses deterministic UUIDv5 per (doc_id, chunk_index).
    """
    if not chunks:
        return

    vectors = embeddings.embed_documents(chunks)
    if len(vectors) != len(chunks):
        raise ValueError("embed_documents returned a different length than chunks")

    points: List[PointStruct] = []
    for i, (vec, text) in enumerate(zip(vectors, chunks)):
        # Deterministic, valid UUID object (NOT a string)
        pid = uuid.uuid5(uuid.NAMESPACE_URL, f"{doc_id}:{i}")

        points.append(
            PointStruct(
                id=str(pid),         # pass uuid.UUID directly
                vector=vec,
                payload={
                    **(metadata or {}),
                    "doc_id": doc_id,
                    "chunk_index": i,
                    "text": text,
                },
            )
        )

    client.upsert(collection_name=QDRANT_COLLECTION, points=points)


def delete_document(doc_id: str):
    """
    Delete all vectors for a given document by payload filter.
    """
    cond = Filter(must=[FieldCondition(key="doc_id", match=MatchValue(value=doc_id))])
    client.delete(collection_name=QDRANT_COLLECTION, points_selector=cond)
