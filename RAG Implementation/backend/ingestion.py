import pandas as pd
import os
import chromadb
from chromadb.utils import embedding_functions
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader
from typing import Dict, List, Any
import uuid
import re

class Ingestor:
    def __init__(self):
        self.db_path = "chroma_db"
        self.client = chromadb.PersistentClient(path=self.db_path)
        self.embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")
        self.collection = None
        self.stats = {
            "total_files": 0,
            "file_list": [],
            "total_chunks": 0,
            "avg_len": 0,
            "min_len": 0,
            "max_len": 0,
            "chunks_all": [],
            "raw_preview": []
        }

    def reset_collection(self):
        collection_name = "knowledge_base_" + str(uuid.uuid4())[:8]
        self.collection = self.client.create_collection(
            name=collection_name, 
            embedding_function=self.embedding_function
        )
        self.stats = {
            "total_files": 0,
            "file_list": [],
            "total_chunks": 0,
            "avg_len": 0,
            "min_len": 0,
            "max_len": 0,
            "chunks_all": [],
            "raw_preview": []
        }

    def process_file(self, file_path: str, chunk_size: int, chunk_overlap: int) -> Dict[str, Any]:
        if self.collection is None:
            self.reset_collection()

        file_name = os.path.basename(file_path)
        self.stats["file_list"].append(file_name)
        self.stats["total_files"] = len(self.stats["file_list"])

        new_chunks = []
        new_metadatas = []

        # Load data based on format
        if file_path.endswith('.csv'):
            try:
                # Try UTF-8 first, fallback to latin-1
                df = pd.read_csv(file_path, encoding='utf-8')
            except UnicodeDecodeError:
                df = pd.read_csv(file_path, encoding='latin-1')
            
            for i, row in df.iterrows():
                row_str = ", ".join([f"{col}: {val}" for col, val in row.to_dict().items()])
                new_chunks.append(f"DATA ROW: {row_str}")
                new_metadatas.append({"source": file_name, "row_index": i})
            
            if not self.stats["raw_preview"]:
                self.stats["raw_preview"] = df.head(10).to_dict(orient='records')

        elif file_path.endswith(('.xls', '.xlsx')):
            df = pd.read_excel(file_path)
            for i, row in df.iterrows():
                row_str = ", ".join([f"{col}: {val}" for col, val in row.to_dict().items()])
                new_chunks.append(f"DATA ROW: {row_str}")
                new_metadatas.append({"source": file_name, "row_index": i})
            
            if not self.stats["raw_preview"]:
                self.stats["raw_preview"] = df.head(10).to_dict(orient='records')

        elif file_path.endswith('.pdf'):
            loader = PyPDFLoader(file_path)
            pages = loader.load()
            all_text = "\n\n".join([p.page_content for p in pages])
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
                separators=["\n\n", "\n", ". ", " ", ""]
            )
            new_chunks = text_splitter.split_text(all_text)
            new_metadatas = [{"source": file_name, "chunk_index": i} for i in range(len(new_chunks))]

        elif file_path.endswith('.txt'):
            with open(file_path, 'r', encoding='utf-8') as f:
                all_text = f.read()
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
                separators=["\n\n", "\n", ". ", " ", ""]
            )
            new_chunks = text_splitter.split_text(all_text)
            new_metadatas = [{"source": file_name, "chunk_index": i} for i in range(len(new_chunks))]
        else:
            raise ValueError(f"Unsupported format: {file_name}")

        # Add to ChromaDB in batches
        batch_size = 100
        for i in range(0, len(new_chunks), batch_size):
            end = min(i + batch_size, len(new_chunks))
            self.collection.add(
                documents=new_chunks[i:end],
                metadatas=new_metadatas[i:end],
                ids=[str(uuid.uuid4()) for _ in range(i, end)]
            )
        
        print(f"Ingested {len(new_chunks)} chunks from {file_name}")

        # Update cumulative stats
        self.stats["chunks_all"].extend(new_chunks)
        self.stats["total_chunks"] = len(self.stats["chunks_all"])
        
        lengths = [len(c) for c in self.stats["chunks_all"]]
        self.stats["avg_len"] = int(sum(lengths) / len(lengths)) if lengths else 0
        self.stats["min_len"] = min(lengths) if lengths else 0
        self.stats["max_len"] = max(lengths) if lengths else 0

        return self.stats

    def get_collection(self):
        return self.collection

    def get_stats(self):
        return self.stats
