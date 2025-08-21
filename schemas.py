# schemas.py
from typing import List, Optional
from datetime import datetime

from pydantic import BaseModel

# Pydantic v2 compatibility (FastAPI >=0.100 uses v2)
try:
    from pydantic import ConfigDict
    V2 = True
except Exception:
    V2 = False


class DocumentOut(BaseModel):
    id: str
    filename: str
    ext: str
    size_bytes: int
    content_hash: str
    storage_path: str
    source: Optional[str] = None
    tags: Optional[List[str]] = None
    uploaded_by: Optional[str] = None
    status: str
    uploaded_at: datetime

    if V2:
        # Pydantic v2
        model_config = ConfigDict(from_attributes=True)
    else:
        # Pydantic v1
        class Config:
            orm_mode = True


class DocumentList(BaseModel):
    items: List[DocumentOut]
    total: int


class UploadResponse(BaseModel):
    created: List[DocumentOut]
