import chromadb
from groq import Groq
from rank_bm25 import BM25Okapi
import numpy as np
import re

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
        
        # Filter out structural keywords (keys) to avoid over-matching
        keys_to_ignore = {'data', 'row', 'id', 'jira_id', 'summary', 'module', 'priority', 'severity', 'labels', 'preconditions', 'steps', 'expected_result', 'test_type', 'owner', 'sprint', 'status'}
        
        tokenized_chunks = []
        for doc in self.chunks:
            tokens = re.findall(r'\w+', doc.lower())
            # Remove keys and very short tokens
            filtered = [t for t in tokens if t not in keys_to_ignore and len(t) > 1]
            tokenized_chunks.append(filtered)
            
        self.bm25 = BM25Okapi(tokenized_chunks)

    def query(self, query: str, api_key: str, model_name: str, top_k: int, rerank_top_n: int):
        if not self.collection:
            raise ValueError("System not initialized. Please upload data first.")

        # 1. Vector Search
        results = self.collection.query(
            query_texts=[query],
            n_results=top_k * 2
        )
        vector_docs = results['documents'][0]
        
        # 2. BM25 Search (Whole collection)
        keys_to_ignore = {'data', 'row', 'id', 'jira_id', 'summary', 'module', 'priority', 'severity', 'labels', 'preconditions', 'steps', 'expected_result', 'test_type', 'owner', 'sprint', 'status'}
        tokens = re.findall(r'\w+', query.lower())
        tokenized_query = [t for t in tokens if t not in keys_to_ignore]
        bm25_scores = self.bm25.get_scores(tokenized_query)
        
        # Get top BM25 results
        top_bm25_indices = np.argsort(bm25_scores)[::-1][:top_k * 2]
        bm25_docs = [self.chunks[i] for i in top_bm25_indices]
        
        # 3. Combine and Re-rank
        # Use a set to avoid duplicates while preserving order (vector results first)
        combined_docs = []
        seen = set()
        for doc in vector_docs + bm25_docs:
            if doc not in seen:
                combined_docs.append(doc)
                seen.add(doc)
        
        # Map scores and metadatas
        ranked_results = []
        all_results = self.collection.get() # Potentially slow if collection is huge, but fine for 1000s
        doc_to_meta = {doc: meta for doc, meta in zip(all_results['documents'], all_results['metadatas'])}
        
        for doc in combined_docs:
            meta = doc_to_meta.get(doc, {})
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

        # 4. Global Statistics (for accurate counting)
        # Count how many chunks in the WHOLE database have a significant keyword match
        # We use a threshold (e.g., 20% of the max score) to filter out noise
        max_score = max(bm25_scores) if len(bm25_scores) > 0 else 0
        threshold = max_score * 0.3 if max_score > 0 else 0
        total_matches = sum(1 for s in bm25_scores if s > threshold and s > 0)
        
        # 5. LLM Synthesis
        client = Groq(api_key=api_key)
        context = "\n\n---\n\n".join([c['content'] for c in top_chunks])
        
        print(f"🔍 Total potential matches in DB: {total_matches}")
        
        prompt = f"""You are an advanced RAG Assistant. Use the provided context to answer the user query.
The context contains information from both PDF documents and CSV/Excel test case files.

GLOBAL KNOWLEDGE:
- I have scanned the entire database and found a total of {total_matches} relevant matches for your query. 
- You are being shown the top {len(top_chunks)} most relevant chunks below.

INSTRUCTIONS:
- Use the "GLOBAL KNOWLEDGE" count to accurately answer questions like "How many..." or "List all...".
- Example: If GLOBAL KNOWLEDGE says 45 matches, say "There are 45 test cases found. Here are the top ones:".
- For each piece of information, briefly mention its source.
- If the answer is not in the context and you can't infer it from global stats, say you don't know.

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
            "top_chunks": top_chunks,
            "total_matches": total_matches
        }
