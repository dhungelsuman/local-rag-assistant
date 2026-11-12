# Local-First RAG Assistant

A high-performance, privacy-first Retrieval-Augmented Generation (RAG) web application engineered to run 100% locally on consumer hardware. Designed to ingest multi-format technical and enterprise documents (PDF, DOCX, PPTX, TXT), embed vectors via HuggingFace, persist data locally in ChromaDB, and execute fast semantic search and inference using Ollama (Llama 3.1).

---

## Architecture & Tech Stack

- **Backend:** FastAPI, Python, Uvicorn, LangChain (LCEL)
- **Frontend:** React, Vite, Tailwind CSS, Lucide Icons, Axios
- **Vector Database:** ChromaDB (Persistent local storage)
- **Embeddings:** HuggingFace (`all-MiniLM-L6-v2`)
- **LLM Runtime:** Ollama (`Llama 3.1 8B`) accelerated locally via GPU VRAM offloading
- **Supported File Parsers:** PDF, DOCX, PPTX, TXT

---

## Key Features

- **Zero Cloud Dependencies:** Operates entirely offline, ensuring complete data privacy, zero compliance risks, and zero API costs.
- **Hardware-Accelerated Inference:** Leverages local GPU acceleration via Ollama for efficient local model execution and low-latency responses.
- **Dynamic Multi-Format Ingestion:** Automatically routes different file types (`.pdf`, `.docx`, `.pptx`, `.txt`) to specialized LangChain document loaders.
- **Transparent Source Citations:** Every AI response extracts and displays exact page numbers and text snippet references mapped directly back to the source documents.

---

## Project Structure

```text
local-rag-assistant/
│
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   └── chroma_db/            # Local vector storage (Gitignored)
│
├── frontend/
│   ├── src/
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
│
├── .gitignore
└── README.md
