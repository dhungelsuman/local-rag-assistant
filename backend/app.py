import os
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from langchain_chroma import Chroma
from langchain_classic.chains import create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_ollama import ChatOllama
from langchain_text_splitters import RecursiveCharacterTextSplitter

# ---------- Config ----------
PERSIST_DIRECTORY = "chroma_db"
FRONTEND_ORIGINS = ["http://localhost:5173", "http://localhost:3000"]  
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".ppt", ".txt"}

app = FastAPI(title="RAG Backend API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
vector_store = Chroma(persist_directory=PERSIST_DIRECTORY, embedding_function=embeddings)
retriever = vector_store.as_retriever(search_kwargs={"k": 3})
llm = ChatOllama(model="llama3.1", temperature=0.2)  # needs: ollama pull llama3.1

prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You are an AI assistant for question-answering tasks. "
     "Use only the retrieved context below to answer the question. "
     "If the answer isn't in the context, say you don't know.\n\n{context}"),
    ("human", "{input}"),
])
retrieval_chain = create_retrieval_chain(
    retriever, create_stuff_documents_chain(llm, prompt)
)
splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)


def get_loader(path: str, ext: str):
    
    if ext == ".pdf":
        from langchain_community.document_loaders import PyPDFLoader
        return PyPDFLoader(path)
    if ext == ".docx":
        from langchain_community.document_loaders import Docx2txtLoader  
        return Docx2txtLoader(path)
    if ext in (".pptx", ".ppt"):
        from langchain_community.document_loaders import UnstructuredPowerPointLoader
        return UnstructuredPowerPointLoader(path)  
    
    from langchain_community.document_loaders import TextLoader
    return TextLoader(path, encoding="utf-8")


# ---------- Endpoints ----------
@app.post("/upload")
def upload_file(file: UploadFile = File(...)):  
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename.")

    name = os.path.basename(file.filename)
    ext = os.path.splitext(name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload a PDF, DOCX, PPTX, or TXT file.",
        )

    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 20 MB).")


    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(data)
        tmp_path = tmp.name

    try:
        documents = get_loader(tmp_path, ext).load()
        chunks = [c for c in splitter.split_documents(documents) if c.page_content.strip()]
        if not chunks:
            raise HTTPException(
                status_code=422,
                detail="No text could be extracted (scanned PDF or empty file?).",
            )

        for chunk in chunks:
            chunk.metadata["source"] = name

   
        old_ids = vector_store.get(where={"source": name})["ids"]
        if old_ids:
            vector_store.delete(ids=old_ids)

        vector_store.add_documents(chunks) 
        return {"message": f"Successfully indexed {name} ({len(chunks)} chunks created)."}

    except HTTPException:
        raise  
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.remove(tmp_path)


class QueryRequest(BaseModel):
    question: str


@app.post("/chat")
async def chat_with_docs(request: QueryRequest):
    if not vector_store.get(limit=1)["ids"]:
        raise HTTPException(status_code=400, detail="No documents uploaded yet. Please upload a file first.")

    try:
        response = await retrieval_chain.ainvoke({"input": request.question})

        sources = []
        for doc in response.get("context", []):
            page = doc.metadata.get("page")
            sources.append({
                "source": doc.metadata.get("source"),
                "page": page + 1 if isinstance(page, int) else None,
                "content": doc.page_content[:200],
            })

        return {"answer": response["answer"], "sources": sources}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/reset")
def reset_documents():
    ids = vector_store.get()["ids"]
    if ids:
        vector_store.delete(ids=ids)
    return {"message": "All documents removed."}