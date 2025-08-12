import os
from pathlib import Path
from getpass import getpass

from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_qdrant import QdrantVectorStore
from langchain_community.embeddings import HuggingFaceEmbeddings # For local models
from langchain_openai import OpenAIEmbeddings
from langchain_community.document_loaders import PyPDFLoader, DirectoryLoader
# from langchain_openai import OpenAIEmbeddings # For OpenAI models

# --- Configuration ---
DATA_DIR = "data" # Directory containing your text files
QDRANT_COLLECTION_NAME = "my_text_files_collection"
PDF_DATA_DIR = "pdf_data" # Directory containing your PDF files
QDRANT_COLLECTION_NAME = "my_pdf_knowledge_base"

# Choose your Qdrant connection method:
# Option 1: In-memory Qdrant (data lost after script ends)
#QDRANT_LOCATION = ":memory:"
#QDRANT_URL = None
#QDRANT_API_KEY = None
#QDRANT_PATH = None

# Option 2: Local On-Disk Qdrant (data persists in the specified path)
# QDRANT_LOCATION = None
# QDRANT_URL = None
# QDRANT_API_KEY = None
# QDRANT_PATH = "./qdrant_data_storage" # Data will be stored here

#Option 3: External Qdrant Server (Docker, Qdrant Cloud)
#Ensure your Qdrant server is running (e.g., via Docker on localhost:6333)
QDRANT_LOCATION = None
QDRANT_URL = "http://localhost:6333" # Replace with your Qdrant Cloud URL if applicable
QDRANT_API_KEY = None # Set this if using Qdrant Cloud for authentication
QDRANT_PATH = None

# Choose your Embedding Model:
# Option A: Local Sentence Transformers Model
#print("Using HuggingFaceEmbeddings (local model)...")
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
# Make sure to run `pip install sentence-transformers`

# Option B: OpenAI Embeddings (uncomment and set API key)
# print("Using OpenAIEmbeddings...")
#if not os.environ.get("OPENAI_API_KEY"):
#     os.environ["OPENAI_API_KEY"] = getpass("Enter your OpenAI API key:")
#     embeddings = OpenAIEmbeddings()
# Make sure to run `pip install langchain-openai openai`

# --- 1. Load Text Files ---
print(f"Loading text files from '{DATA_DIR}'...")
documents = []
for file_path in Path(DATA_DIR).rglob("*.txt"): # rglob finds .txt files recursively
    try:
        loader = TextLoader(str(file_path))
        # Load and add metadata to track source file
        loaded_docs = loader.load()
        for doc in loaded_docs:
            doc.metadata["source"] = str(file_path) # Add the original file path as metadata
        documents.extend(loaded_docs)
        print(f"  - Loaded: {file_path}")
    except Exception as e:
        print(f"  - Error loading {file_path}: {e}")

if not documents:
    print(f"No text files found in '{DATA_DIR}'. Please add some .txt files.")
    exit()
# --- 1. Load PDF Documents ---
print(f"Loading PDF files from '{PDF_DATA_DIR}'...")
documents = []
if not os.path.exists(PDF_DATA_DIR):
    print(f"Error: Directory '{PDF_DATA_DIR}' not found. Please create it and place your PDF files inside.")
    exit()

try:
    # DirectoryLoader with PyPDFLoader for all .pdf files
    loader = DirectoryLoader(
        PDF_DATA_DIR,
        glob="**/*.pdf",  # Finds all .pdf files recursively in subdirectories
        loader_cls=PyPDFLoader,
        # loader_kwargs={'extract_images': False} # Set to True if you need images extracted
    )
    documents = loader.load()
    print(f"Loaded {len(documents)} pages from PDFs.")
except Exception as e:
    print(f"Error loading PDFs: {e}")
    print("Ensure you have PDF files in the 'pdf_data' directory and 'pypdf' is installed.")
    exit()

if not documents:
    print(f"No PDF documents found in '{PDF_DATA_DIR}'. Please add some PDF files.")
    exit()

# --- 2. Split Documents into Chunks ---
print(f"\nSplitting {len(documents)} documents into smaller chunks...")
# Adjust chunk_size and chunk_overlap based on your needs and embedding model's context window
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,      # Max characters in a chunk
    chunk_overlap=200,    # Overlap between chunks to maintain context
    length_function=len,  # Use character length
    is_separator_regex=False,
)
split_documents = text_splitter.split_documents(documents)
print(f"Original documents split into {len(split_documents)} chunks.")

# --- 3. Store in Qdrant ---
print(f"\nStoring {len(split_documents)} chunks in Qdrant collection '{QDRANT_COLLECTION_NAME}'...")

# Initialize QdrantVectorStore with the chosen configuration
qdrant_vectorstore = QdrantVectorStore.from_documents(
    documents=split_documents,
    embedding=embeddings,
    collection_name=QDRANT_COLLECTION_NAME,
    location=QDRANT_LOCATION,  # Use for in-memory
    url=QDRANT_URL,            # Use for external server
    api_key=QDRANT_API_KEY,    # Use for external server (especially Qdrant Cloud)
    path=QDRANT_PATH,          # Use for local on-disk
    force_recreate=True        # WARNING: This deletes the collection if it exists!
                               # Set to False if you want to add to an existing collection.
)

print(f"\nSuccessfully stored documents in Qdrant collection: '{QDRANT_COLLECTION_NAME}'")

# --- 4. Verify by Performing a Similarity Search ---
print("\n--- Performing a test similarity search ---")
query_text = "What is jesa group?"
found_docs = qdrant_vectorstore.similarity_search(query_text, k=2)

print(f"\nTop 2 most similar chunks for query: '{query_text}'")
for i, doc in enumerate(found_docs):
    print(f"\n--- Result {i+1} ---")
    print(f"Content: {doc.page_content[:200]}...") # Print first 200 chars
    print(f"Source: {doc.metadata.get('source', 'N/A')}")
    # print(f"Metadata: {doc.metadata}") # Uncomment to see full metadata