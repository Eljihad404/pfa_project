# docs.py
import os
import hashlib
import shutil
from typing import List, Optional
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from db import SessionLocal, engine
from models import Base, Document
from schemas import DocumentOut, DocumentList, UploadResponse
from utils_text import extract_text, chunk_text
from langchain_store import upsert_document, delete_document

# Auth dep (assumes you already have it). Replace if your path differs.
try:
    from auth import get_current_user  # should return a user object with an id or email
except Exception:
    def get_current_user():
        return {"id": "anonymous"}

router = APIRouter()

STORAGE_DIR = Path(os.getenv("DOCS_STORAGE_DIR", "storage/docs"))
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Create tables if not exist
Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


ALLOWED_EXTS = {".pdf", ".docx", ".txt", ".md"}


def sha256_fileobj(fp) -> str:
    """Compute SHA-256 over a file-like object (reads in 1MB chunks)."""
    h = hashlib.sha256()
    for chunk in iter(lambda: fp.read(1024 * 1024), b""):
        h.update(chunk)
    return h.hexdigest()


@router.post("/upload", response_model=UploadResponse)
async def upload_docs(
    files: List[UploadFile] = File(...),
    source: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Upload one or more documents:
      - Saves original file to STORAGE_DIR
      - Extracts text and chunks
      - Upserts chunks to vector store with metadata
      - Stores document metadata in relational DB
    """
    created: List[Document] = []
    tags_list = [t.strip() for t in (tags or "").split(",") if t.strip()] or None

    for uf in files:
        ext = Path(uf.filename).suffix.lower()
        if ext not in ALLOWED_EXTS:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

        # Compute content hash (read once)
        uf.file.seek(0)
        content_hash = sha256_fileobj(uf.file)
        uf.file.seek(0)

        # Persist file deterministically by (filename + hash)
        doc_id = hashlib.md5((uf.filename + content_hash).encode()).hexdigest()
        safe_name = f"{doc_id}{ext}"
        dest_path = STORAGE_DIR / safe_name

        try:
            with dest_path.open("wb") as out:
                shutil.copyfileobj(uf.file, out)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

        size_bytes = dest_path.stat().st_size

        # Extract & chunk text
        try:
            text = extract_text(str(dest_path))
            chunks = chunk_text(text)
            if not chunks:
                # Clean up on empty content
                dest_path.unlink(missing_ok=True)
                raise HTTPException(status_code=400, detail=f"No extractable text in {uf.filename}")
        except HTTPException:
            # already raised with cleanup
            raise
        except Exception as e:
            # rollback file if needed
            dest_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail=f"Failed to process {uf.filename}: {e}")

        # Upsert to vector DB with metadata
        metadata = {
            "filename": uf.filename,
            "ext": ext,
            "source": source,
            "tags": tags_list,
            "uploaded_by": (getattr(user, "id", None) or getattr(user, "email", None) or (user.get("id") if isinstance(user, dict) else None) or "anonymous"),
            "uploaded_at": datetime.utcnow().isoformat(),
            "content_hash": content_hash,
        }
        try:
            upsert_document(doc_id, chunks, metadata)
        except Exception as e:
            # Remove the file if indexing fails
            dest_path.unlink(missing_ok=True)
            raise HTTPException(status_code=500, detail=f"Indexing error: {e}")

        # Save metadata in DB
        try:
            doc = Document(
                id=doc_id,
                filename=uf.filename,
                ext=ext,
                size_bytes=size_bytes,
                content_hash=content_hash,
                storage_path=str(dest_path),
                source=source,
                tags=tags_list,
                uploaded_by=metadata["uploaded_by"],
                status="ready",
            )
            db.add(doc)
        except Exception as e:
            # Best-effort cleanup in case DB write fails
            try:
                delete_document(doc_id)
            except Exception:
                pass
            dest_path.unlink(missing_ok=True)
            raise HTTPException(status_code=500, detail=f"Database error: {e}")

    db.commit()

    # Return the last N created (ordered by uploaded_at)
    items = (
        db.query(Document)
        .order_by(Document.uploaded_at.desc())
        .limit(len(files))
        .all()
    )
    created.extend(items)

    return UploadResponse(created=created)  # pydantic handles conversion


@router.get("/", response_model=DocumentList)
def list_docs(
    q: Optional[str] = None,
    tag: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """
    List documents with optional filename search and tag filter.
    Note: For SQLite, tag filter uses LIKE on serialized JSON; for Postgres prefer JSON operators.
    """
    qry = db.query(Document)
    if q:
        like = f"%{q}%"
        qry = qry.filter(Document.filename.ilike(like))
    if tag:
        # crude JSON contains search for sqlite; for Postgres use JSON operators instead
        qry = qry.filter(Document.tags.like(f"%{tag}%"))
    total = qry.count()
    items = qry.order_by(Document.uploaded_at.desc()).offset(skip).limit(limit).all()
    return {"items": items, "total": total}


@router.delete("/{doc_id}")
def delete_doc(doc_id: str, db: Session = Depends(get_db)):
    """
    Delete a document:
      - Remove from vector DB (by payload filter in langchain_store.delete_document)
      - Remove file from disk
      - Remove row from DB
    """
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete from vector store
    try:
        delete_document(doc_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete from vector DB: {e}")

    # Remove file from storage (best-effort)
    try:
        Path(doc.storage_path).unlink(missing_ok=True)
    except Exception:
        pass

    db.delete(doc)
    db.commit()
    return {"ok": True}


@router.post("/reindex/{doc_id}")
def reindex_doc(doc_id: str, db: Session = Depends(get_db)):
    """
    Re-extract text from the stored file and re-upsert chunks into the vector DB.
    """
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # re-extract & re-upsert
    try:
        text = extract_text(doc.storage_path)
        chunks = chunk_text(text)
        if not chunks:
            raise HTTPException(status_code=400, detail=f"No extractable text in {doc.filename}")

        metadata = {
            "filename": doc.filename,
            "ext": doc.ext,
            "source": doc.source,
            "tags": doc.tags,
            "uploaded_by": doc.uploaded_by,
            "uploaded_at": doc.uploaded_at.isoformat() if hasattr(doc.uploaded_at, "isoformat") else str(doc.uploaded_at),
            "content_hash": doc.content_hash,
        }
        # Remove old points then insert fresh ones
        delete_document(doc_id)
        upsert_document(doc_id, chunks, metadata)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reindex error: {e}")


@router.get("/download/{doc_id}")
def download_doc(doc_id: str, db: Session = Depends(get_db)):
    """
    Download the original file for a document.
    """
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return FileResponse(path=doc.storage_path, filename=doc.filename)
