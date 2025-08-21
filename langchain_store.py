# langchain_store.py
import os
from typing import List, Dict

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue

# LangChain imports across versions
try:
    from langchain_huggingface import HuggingFaceEmbeddings  # new
except Exception:  # older LC
    from langchain.embeddings import HuggingFaceEmbeddings

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
    # try underlying SentenceTransformer (some LC versions expose `.client`, others `.model`)
    for attr in ("client", "model"):
        try:
            st = getattr(embeddings, attr)
            return st.get_sentence_embedding_dimension()
        except Exception:
            pass
    # last resort: compute one vector
    return len(embeddings.embed_query("dimension probe"))

def _ensure_collection():
    dim = _embedding_dim()
    try:
        client.get_collection(QDRANT_COLLECTION)  # exists → OK
        return
    except Exception:
        # 404 → create
        pass

    from qdrant_client.models import Distance as D
    dist_map = {"COSINE": D.COSINE, "DOT": D.DOT, "EUCLID": D.EUCLID}
    client.create_collection(
        collection_name=QDRANT_COLLECTION,
        vectors_config=VectorParams(size=dim, distance=dist_map.get(DISTANCE, D.COSINE)),
    )

_ensure_collection()

# --------------------
# Public API
# --------------------
def upsert_document(doc_id: str, chunks: List[str], metadata: Dict):
    if not chunks:
        return

    vectors = embeddings.embed_documents(chunks)

    points = []
    for i, (vec, text) in enumerate(zip(vectors, chunks)):
        # ✅ Use a deterministic UUIDv5 so reindexing/upserting is idempotent
        pid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{doc_id}:{i}"))

        points.append(
            PointStruct(
                id=pid,               # <-- must be an int or a UUID
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
