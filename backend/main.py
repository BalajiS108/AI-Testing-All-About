from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import os
import shutil
from ingestion import Ingestor
from retrieval import Retriever

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

ingestor = Ingestor()
retriever = Retriever()

@app.get("/")
async def root():
    return {"message": "Advanced RAG Explorer API is running"}

@app.post("/ingest")
async def ingest_files(
    files: List[UploadFile] = File(...),
    chunk_size: int = Form(500),
    chunk_overlap: int = Form(50)
):
    try:
        last_stats = None
        for file in files:
            file_path = os.path.join(UPLOAD_DIR, file.filename)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            last_stats = ingestor.process_file(file_path, chunk_size, chunk_overlap)
        
        retriever.initialize(ingestor.get_collection())
        
        return {
            "status": "success",
            "files": [f.filename for f in files],
            "stats": last_stats
        }
    except Exception as e:
        print(f"Ingestion error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/reset")
async def reset_system():
    ingestor.reset_collection()
    return {"status": "reset successful"}

@app.post("/query")
async def query_rag(
    query: str = Form(...),
    api_key: str = Form(...),
    model_name: str = Form("llama-3.1-8b-instant"),
    top_k: int = Form(5),
    rerank_top_n: int = Form(3)
):
    try:
        results = retriever.query(query, api_key, model_name, top_k, rerank_top_n)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
