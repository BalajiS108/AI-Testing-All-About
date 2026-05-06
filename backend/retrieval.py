import chromadb
from groq import Groq
from rank_bm25 import BM25Okapi
import numpy as np

class Retriever:
    def __init__(self):
        self.collection = None
        self.bm25 = None
        self.chunks = []

    def initialize(self, collection):
        self.collection = collection
        # Pre-calculate BM25 for re-ranking
        results = self.collection.get()
        self.chunks = results['documents']
        tokenized_chunks = [doc.lower().split() for doc in self.chunks]
        self.bm25 = BM25Okapi(tokenized_chunks)

    def query(self, query: str, api_key: str, model_name: str, top_k: int, rerank_top_n: int):
        if not self.collection:
            raise ValueError("System not initialized. Please upload data first.")

        # 1. Vector Search
        results = self.collection.query(
            query_texts=[query],
            n_results=top_k * 2 # Get more for re-ranking
        )

        initial_docs = results['documents'][0]
        initial_metadatas = results['metadatas'][0]
        
        # 2. BM25 Re-ranking
        tokenized_query = query.lower().split()
        bm25_scores = self.bm25.get_scores(tokenized_query)
        
        # Map scores to the retrieved documents
        ranked_results = []
        for doc, meta in zip(initial_docs, initial_metadatas):
            # Find the original index of this document to get its BM25 score
            try:
                idx = self.chunks.index(doc)
                score = bm25_scores[idx]
            except:
                score = 0
            
            ranked_results.append({
                "content": doc,
                "metadata": meta,
                "bm25_score": float(score)
            })

        # Sort by BM25 score and take top N
        ranked_results.sort(key=lambda x: x['bm25_score'], reverse=True)
        top_chunks = ranked_results[:rerank_top_n]

        # 3. LLM Synthesis
        client = Groq(api_key=api_key)
        context = "\n\n---\n\n".join([c['content'] for c in top_chunks])
        
        prompt = f"""You are an advanced RAG Assistant. Use the provided context to answer the user query.
If the answer is not in the context, say you don't know. Be professional and concise.

CONTEXT:
{context}

QUERY:
{query}

ANSWER:"""

        completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=model_name,
            temperature=0.1
        )

        return {
            "answer": completion.choices[0].message.content,
            "top_chunks": top_chunks
        }
