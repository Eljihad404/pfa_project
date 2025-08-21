# utils_text.py
from pathlib import Path
from typing import List

def extract_text(path: str) -> str:
    """Extract plain text from .txt/.md/.pdf/.docx with graceful fallbacks."""
    p = Path(path)
    ext = p.suffix.lower()

    if ext in {".txt", ".md"}:
        # Simple read
        return p.read_text(encoding="utf-8", errors="ignore")

    if ext == ".pdf":
        # Try PyPDF first, then fallback to PyMuPDF if available
        try:
            from pypdf import PdfReader  # pip install pypdf
            reader = PdfReader(str(p))
            return "\n".join((page.extract_text() or "") for page in reader.pages)
        except Exception:
            try:
                import fitz  # PyMuPDF  # pip install pymupdf
                text = []
                with fitz.open(str(p)) as doc:
                    for page in doc:
                        text.append(page.get_text() or "")
                return "\n".join(text)
            except Exception as e:
                raise RuntimeError(
                    "PDF extraction requires 'pypdf' or 'pymupdf' to be installed."
                ) from e

    if ext == ".docx":
        try:
            import docx  # python-docx  # pip install python-docx
            d = docx.Document(str(p))
            return "\n".join(para.text for para in d.paragraphs)
        except Exception as e:
            raise RuntimeError("DOCX extraction requires 'python-docx' to be installed.") from e

    raise RuntimeError(f"Unsupported file type for extraction: {ext}")

def chunk_text(text: str, chunk_size: int = 1200, overlap: int = 200) -> List[str]:
    """
    Naive character-based chunking (works fine for most RAG pipelines).
    chunk_size ~ approx tokens*4 if you later want to think in tokens.
    """
    if not text:
        return []
    text = text.strip()
    if chunk_size <= 0:
        return [text]
    chunks = []
    i = 0
    n = len(text)
    while i < n:
        j = min(i + chunk_size, n)
        chunks.append(text[i:j])
        if j >= n:
            break
        i = j - max(0, overlap)
    return chunks
