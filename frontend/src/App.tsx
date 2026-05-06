import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { 
  Upload, Database, Search, Layers, Cpu, Settings, 
  CheckCircle, Activity, Sun, Moon, RefreshCw, 
  FileText, ChevronRight, BarChart, MessageCircle, Info,
  SearchCode, ListFilter, Braces, ChevronLeft, ShieldCheck,
  Zap, BrainCircuit, Workflow, Binary, PlusCircle, Trash2,
  HardDriveUpload, Play
} from 'lucide-react';

const API_BASE = 'http://localhost:8000';
const CHUNKS_PER_PAGE = 12;

const App: React.FC = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState('preview');
  
  // File Queues
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [ingestedFileNames, setIngestedFileNames] = useState<string[]>([]);
  
  const [stats, setStats] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [chunkSize, setChunkSize] = useState(500);
  const [overlap, setOverlap] = useState(100);
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('llama-3.1-8b-instant');
  const [topK, setTopK] = useState(5);
  const [rerankTopN, setRerankTopN] = useState(3);
  
  const [query, setQuery] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState('');
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (darkMode) document.body.classList.add('dark-mode');
    else document.body.classList.remove('dark-mode');
  }, [darkMode]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setStagedFiles(prev => [...prev, ...files]);
      setActiveTab('preview');
    }
  };

  const handleProcessAll = async () => {
    if (stagedFiles.length === 0) {
      setError("Staging Error: No documents found to process.");
      return;
    }

    setIsProcessing(true);
    setProcessStatus('Initializing Multi-File Pipeline...');
    setError(null);
    
    // Clear existing for a fresh "Process All"
    await axios.post(`${API_BASE}/reset`);

    const formData = new FormData();
    stagedFiles.forEach(file => formData.append('files', file));
    formData.append('chunk_size', chunkSize.toString());
    formData.append('chunk_overlap', overlap.toString());
    
    try {
      const res = await axios.post(`${API_BASE}/ingest`, formData);
      setStats(res.data.stats);
      setIngestedFileNames(stagedFiles.map(f => f.name));
      setIsProcessing(false);
      setProcessStatus('');
      setActiveTab('chunks');
    } catch (err: any) {
      setError(err.response?.data?.detail || "Ingestion failed.");
      setIsProcessing(false);
      setProcessStatus('');
    }
  };

  const handleReset = async () => {
    await axios.post(`${API_BASE}/reset`);
    setStagedFiles([]);
    setIngestedFileNames([]);
    setStats(null);
    setResults(null);
    setActiveTab('preview');
  };

  const handleQuery = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query || !apiKey) {
      setError("Configuration Error: Please enter your Groq API key and a search query.");
      return;
    }

    setIsQuerying(true);
    setError(null);
    setActiveTab('results');

    try {
      const formData = new FormData();
      formData.append('query', query);
      formData.append('api_key', apiKey);
      formData.append('model_name', modelName);
      formData.append('top_k', topK.toString());
      formData.append('rerank_top_n', rerankTopN.toString());
      
      const res = await axios.post(`${API_BASE}/query`, formData);
      setResults(res.data);
      setIsQuerying(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Inference failed.");
      setIsQuerying(false);
    }
  };

  const allChunks = stats?.chunks_all || [];
  const totalPages = Math.ceil(allChunks.length / CHUNKS_PER_PAGE);
  const paginatedChunks = allChunks.slice((currentPage - 1) * CHUNKS_PER_PAGE, currentPage * CHUNKS_PER_PAGE);

  return (
    <div className="app-container">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px' }}>
          <div style={{ padding: '10px', background: '#d97757', borderRadius: '12px' }}>
            <BrainCircuit size={24} color="white"/>
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold' }}>RAG Explorer</h1>
            <p style={{ fontSize: '10px', fontWeight: '800', color: '#d97757', letterSpacing: '0.1em' }}>NEURAL STAGING PRO</p>
          </div>
        </div>

        <div className="step-card">
          <div className="step-header">
            <div className="step-num">1</div>
            <h3 style={{ fontSize: '14px' }}>AI Configuration</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input type="password" className="input-field" placeholder="GROQ API KEY" value={apiKey} onChange={(e)=>setApiKey(e.target.value)} />
            <input type="text" className="input-field" placeholder="MODEL NAME" value={modelName} onChange={(e)=>setModelName(e.target.value)} />
          </div>
        </div>

        <div className="step-card">
          <div className="step-header">
            <div className="step-num">2</div>
            <h3 style={{ fontSize: '14px' }}>Document Staging</h3>
          </div>
          <div 
            style={{ border: '2px dashed var(--border)', borderRadius: '12px', padding: '20px', textAlign: 'center', cursor: 'pointer', marginBottom: '12px' }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" style={{display:'none'}} />
            <HardDriveUpload size={20} style={{ color: '#d97757', margin: '0 auto 8px' }} />
            <p style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)' }}>STAGE FILES</p>
          </div>
          
          {stagedFiles.length > 0 && (
            <div style={{ marginBottom: '16px', maxHeight: '100px', overflowY: 'auto', background: 'var(--bg-sidebar)', borderRadius: '8px', padding: '8px' }}>
              {stagedFiles.map((f, i) => (
                <div key={i} style={{ fontSize: '9px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  • {f.name}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="step-card">
          <div className="step-header">
            <div className="step-num">3</div>
            <h3 style={{ fontSize: '14px' }}>Pipeline Tuning</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: '800', marginBottom: '4px' }}>
                <span>CHUNK SIZE</span>
                <span style={{ color: '#d97757' }}>{chunkSize}</span>
              </div>
              <input type="range" min="100" max="3000" style={{ accentColor: '#d97757', width: '100%' }} value={chunkSize} onChange={(e) => setChunkSize(Number(e.target.value))} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: '800', marginBottom: '4px' }}>
                <span>OVERLAP (CHAR)</span>
                <span style={{ color: '#d97757' }}>{overlap}</span>
              </div>
              <input type="range" min="0" max="1000" style={{ accentColor: '#d97757', width: '100%' }} value={overlap} onChange={(e) => setOverlap(Number(e.target.value))} />
            </div>
            <button className="btn-primary" onClick={handleProcessAll} disabled={stagedFiles.length === 0 || isProcessing}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {isProcessing ? <RefreshCw size={14} className="animate-spin"/> : <Play size={14}/>}
                Process All Data
              </div>
            </button>
          </div>
        </div>

        <div className="step-card">
          <div className="step-header">
            <div className="step-num">4</div>
            <h3 style={{ fontSize: '14px' }}>Retrieval Control</h3>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div className="flex-1">
              <label style={{ fontSize: '9px', fontWeight: '800', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>TOP-K</label>
              <input type="number" className="input-field" value={topK} onChange={(e)=>setTopK(Number(e.target.value))} />
            </div>
            <div className="flex-1">
              <label style={{ fontSize: '9px', fontWeight: '800', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>RERANK N</label>
              <input type="number" className="input-field" value={rerankTopN} onChange={(e)=>setRerankTopN(Number(e.target.value))} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
           <button onClick={handleReset} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Trash2 size={14} />
              <span style={{ fontSize: '11px', fontWeight: '800' }}>CLEAR SESSION</span>
           </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        <header className="header">
          <div style={{ display: 'flex', gap: '40px' }}>
            <button className={`tab-btn ${activeTab === 'preview' ? 'active' : ''}`} onClick={()=>setActiveTab('preview')}>Inventory</button>
            <button className={`tab-btn ${activeTab === 'chunks' ? 'active' : ''}`} onClick={()=>setActiveTab('chunks')}>Neural Nodes</button>
            <button className={`tab-btn ${activeTab === 'results' ? 'active' : ''}`} onClick={()=>setActiveTab('results')}>Intelligence</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
             {isProcessing && <div style={{ fontSize: '10px', fontWeight: '800', color: '#d97757' }} className="animate-pulse">{processStatus}</div>}
             <button onClick={()=>setDarkMode(!darkMode)} style={{ padding: '8px', background: 'var(--bg-sidebar)', border: 'none', borderRadius: '10px', cursor: 'pointer', color: 'var(--text-main)' }}>
                {darkMode ? <Sun size={18}/> : <Moon size={18}/>}
             </button>
          </div>
        </header>

        <div className="scroll-area">
          {error && (
            <div className="animate-fade" style={{ background: '#fff5f5', border: '1px solid #fed7d7', padding: '16px', borderRadius: '12px', marginBottom: '32px', color: '#c53030', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <Info size={20} />
              <span style={{ fontSize: '14px', fontWeight: '600' }}>{error}</span>
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="animate-fade">
               <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div className="card">
                     <h3 style={{ fontSize: '12px', fontWeight: '800', marginBottom: '16px', color: 'var(--accent)', textTransform: 'uppercase' }}>Current Document Pool</h3>
                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                        {(stagedFiles.length > 0 ? stagedFiles.map(f=>f.name) : ingestedFileNames).map((name, i) => (
                           <div key={i} style={{ padding: '12px', background: 'var(--bg-sidebar)', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', gap: '10px', alignItems: 'center' }}>
                              <FileText size={14} color="#d97757" />
                              <span style={{ fontSize: '11px', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                              {stagedFiles.length > 0 && !ingestedFileNames.includes(name) && <span style={{ fontSize: '8px', fontWeight: '900', color: '#3b82f6' }}>STAGED</span>}
                           </div>
                        ))}
                        {stagedFiles.length === 0 && ingestedFileNames.length === 0 && (
                          <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', opacity: 0.3 }}>
                            <HardDriveUpload size={40} style={{ margin: '0 auto 10px' }} />
                            <p style={{ fontSize: '12px', fontWeight: '700' }}>NO DOCUMENTS STAGED</p>
                          </div>
                        )}
                     </div>
                  </div>
                  
                  {stats?.raw_preview && (
                    <div className="data-table-container">
                       <table className="data-table">
                          <thead>
                            <tr>{Object.keys(stats.raw_preview[0]).map(key => (<th key={key}>{key}</th>))}</tr>
                          </thead>
                          <tbody>
                            {stats.raw_preview.map((row: any, i: number) => (
                              <tr key={i}>{Object.values(row).map((val: any, j: number) => (
                                <td key={j} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>{String(val)}</td>
                              ))}</tr>
                            ))}
                          </tbody>
                       </table>
                    </div>
                  )}
               </div>
            </div>
          )}

          {activeTab === 'chunks' && (
            <div className="animate-fade">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                {paginatedChunks.map((chunk: string, i: number) => (
                  <div key={i} className="card">
                    <span style={{ fontSize: '9px', fontWeight: '900', color: 'var(--accent)', background: 'var(--accent-soft)', padding: '2px 6px', borderRadius: '4px', marginBottom: '12px', display: 'inline-block' }}>NODE #{(currentPage-1)*CHUNKS_PER_PAGE + i + 1}</span>
                    <p style={{ fontSize: '13px', lineHeight: '1.7', color: 'var(--text-main)', display: '-webkit-box', WebkitLineClamp: 8, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{chunk}</p>
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', marginTop: '40px' }}>
                  <button disabled={currentPage === 1} onClick={()=>setCurrentPage(p => p - 1)} style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '8px', background: 'white' }}><ChevronLeft size={18}/></button>
                  <span style={{ fontSize: '13px', fontWeight: '800' }}>{currentPage} / {totalPages}</span>
                  <button disabled={currentPage === totalPages} onClick={()=>setCurrentPage(p => p + 1)} style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '8px', background: 'white' }}><ChevronRight size={18}/></button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'results' && (
            <div className="animate-fade" style={{ maxWidth: '1000px', margin: '0 auto' }}>
               <div className="card" style={{ marginBottom: '40px', padding: '40px', boxShadow: '0 20px 40px rgba(0,0,0,0.05)' }}>
                  <h2 style={{ fontSize: '26px', fontWeight: '800', marginBottom: '24px', textAlign: 'center' }}>Contextual Search</h2>
                  <form onSubmit={handleQuery} style={{ position: 'relative' }}>
                    <Search style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={20} />
                    <input type="text" className="input-field" style={{ padding: '18px 20px 18px 54px', borderRadius: '40px', fontSize: '16px' }} placeholder="Ask about your knowledge pool..." value={query} onChange={(e)=>setQuery(e.target.value)} />
                    <button type="submit" className="btn-primary" style={{ position: 'absolute', right: '8px', top: '8px', borderRadius: '30px', padding: '10px 24px' }} disabled={isQuerying || !stats}>
                      {isQuerying ? 'Analyzing...' : 'Search'}
                    </button>
                  </form>
               </div>

               {results ? (
                 <div className="animate-fade">
                    <div className="card" style={{ marginBottom: '32px', borderTop: '4px solid var(--accent)' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--accent)' }}>
                         <Zap size={18} fill="currentColor" />
                         <span style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase' }}>Synthesized Answer</span>
                       </div>
                       <div style={{ fontSize: '16px', lineHeight: '1.8', fontWeight: '500', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>{results.answer}</div>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {results.top_chunks.map((c: any, i: number) => (
                        <div key={i} className="card" style={{ display: 'flex', gap: '20px', borderLeft: '1px solid var(--border)' }}>
                           <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--bg-sidebar)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '800', color: 'var(--accent)' }}>{i+1}</div>
                           <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                 <span style={{ fontSize: '9px', fontWeight: '900', color: '#10b981', background: '#ecfdf5', padding: '2px 6px', borderRadius: '4px' }}>RELEVANCE: {(c.bm25_score * 10).toFixed(1)}%</span>
                                 <span style={{ fontSize: '9px', fontWeight: '900', color: 'var(--accent)' }}>{c.metadata.source || 'Knowledge Base'}</span>
                              </div>
                              <p style={{ fontSize: '13px', color: 'var(--text-main)', lineHeight: '1.6' }}>{c.content}</p>
                           </div>
                        </div>
                      ))}
                    </div>
                 </div>
               ) : isQuerying ? (
                 <div style={{ padding: '80px 0', textAlign: 'center' }}>
                   <RefreshCw className="animate-spin" size={40} style={{ color: 'var(--accent)', margin: '0 auto 16px' }} />
                   <p style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Retrieving Knowledge...</p>
                 </div>
               ) : null}
            </div>
          )}
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .hidden { display: none; }
        .animate-fade { animation: fadeIn 0.4s ease-out; }
        .animate-spin { animation: spin 1s linear infinite; }
        .animate-pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      ` }} />
    </div>
  );
};

export default App;
