import React, { useState } from 'react';
import { X, ShieldCheck, Database, Cpu, Zap, Activity, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { ALMProvider, LLMProvider, Connection, LLMConfig } from '../types';
import { verifyJiraConnection } from '../services/jiraService';
import { verifyOllama, verifyGroq } from '../services/llmService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  connections: Connection[];
  onSaveConnections: (conns: Connection[]) => void;
  llmConfig: LLMConfig | null;
  onSaveLLM: (config: LLMConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  connections, 
  onSaveConnections, 
  llmConfig: initialLlmConfig, 
  onSaveLLM 
}) => {
  const [activeTab, setActiveTab] = useState<'jira' | 'llm'>('jira');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'success' | 'error' | 'warning', message: string } | null>(null);

  // Form State for Jira/ADO
  const [jiraForm, setJiraForm] = useState<Partial<Connection>>(
    connections[0] || { type: 'Jira', name: 'BSS_QA', url: '', email: '', apiToken: '' }
  );

  // Form State for LLM
  const [llmForm, setLlmForm] = useState<LLMConfig>(
    initialLlmConfig || { provider: 'Ollama', apiKey: '', baseUrl: 'http://localhost:11434', model: 'llama3' }
  );

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      let result;
      if (activeTab === 'jira') {
        result = await verifyJiraConnection(jiraForm as any);
      } else {
        if (llmForm.provider === 'Ollama') {
          result = await verifyOllama(llmForm.baseUrl, llmForm.model);
        } else {
          result = await verifyGroq(llmForm.apiKey);
        }
      }
      setTestResult(result as any);
    } catch (error: any) {
      setTestResult({ status: 'error', message: error.message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    if (activeTab === 'jira') {
      const newConn = { ...jiraForm, id: jiraForm.id || crypto.randomUUID() } as Connection;
      onSaveConnections([newConn]); // For now, single connection support
    } else {
      onSaveLLM(llmForm);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}></div>
      
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
        {/* Modal Header */}
        <div className="px-10 py-8 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Connectivity</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Configure your AI & ALM Integrations</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-50 rounded-2xl transition-all text-slate-400 hover:text-slate-600 active:scale-95">
            <X size={20} />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex bg-slate-100/50 p-1.5 gap-1 m-8 rounded-2xl border border-slate-100/50">
          <button 
            onClick={() => { setActiveTab('jira'); setTestResult(null); }}
            className={`flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl transition-all duration-300 font-black text-[11px] uppercase tracking-widest ${
              activeTab === 'jira' ? 'bg-white shadow-md text-blue-600 translate-y-[-1px]' : 'text-slate-400 hover:text-slate-500'
            }`}
          >
            <Database size={15} />
            Data Source
          </button>
          <button 
            onClick={() => { setActiveTab('llm'); setTestResult(null); }}
            className={`flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl transition-all duration-300 font-black text-[11px] uppercase tracking-widest ${
              activeTab === 'llm' ? 'bg-white shadow-md text-blue-600 translate-y-[-1px]' : 'text-slate-400 hover:text-slate-500'
            }`}
          >
            <Cpu size={15} />
            LLM Brain
          </button>
        </div>

        {/* Modal Body */}
        <div className="px-10 pb-10 overflow-y-auto flex-1">
          {activeTab === 'jira' ? (
            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-1">
                  <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 ml-1">Platform</label>
                  <select 
                    value={jiraForm.type}
                    onChange={(e) => setJiraForm({ ...jiraForm, type: e.target.value as ALMProvider })}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl px-5 py-4 font-bold text-xs text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all appearance-none cursor-pointer"
                  >
                     <option>Jira</option>
                     <option>ADO</option>
                     <option>X-Ray</option>
                  </select>
                </div>
                <div className="col-span-1">
                  <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 ml-1">Label</label>
                  <input 
                    type="text" 
                    value={jiraForm.name}
                    onChange={(e) => setJiraForm({ ...jiraForm, name: e.target.value })}
                    placeholder="e.g. BSS_QA" 
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl px-5 py-4 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all" 
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 ml-1">Instance URL</label>
                <input 
                  type="text" 
                  value={jiraForm.url}
                  onChange={(e) => setJiraForm({ ...jiraForm, url: e.target.value })}
                  placeholder="https://your-domain.atlassian.net" 
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl px-5 py-4 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all" 
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 ml-1">Auth Email</label>
                  <input 
                    type="text" 
                    value={jiraForm.email}
                    onChange={(e) => setJiraForm({ ...jiraForm, email: e.target.value })}
                    placeholder="admin@example.com" 
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl px-5 py-4 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all" 
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 ml-1">API Token</label>
                  <input 
                    type="password" 
                    value={jiraForm.apiToken}
                    onChange={(e) => setJiraForm({ ...jiraForm, apiToken: e.target.value })}
                    placeholder="••••••••••••" 
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl px-5 py-4 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all" 
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
               <div>
                  <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4 ml-1">Intelligence Provider</label>
                  <div className="grid grid-cols-3 gap-4">
                     {(['Ollama', 'Groq', 'OpenAI'] as LLMProvider[]).map(p => (
                       <button 
                         key={p} 
                         onClick={() => {
                           setLlmForm({ 
                             ...llmForm, 
                             provider: p,
                             model: p === 'Ollama' ? 'llama3' : p === 'Groq' ? 'llama3-70b-8192' : 'gpt-4o'
                           });
                           setTestResult(null);
                         }}
                         className={`py-5 border rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all duration-300 ${
                           llmForm.provider === p 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-100 -translate-y-1' 
                            : 'bg-slate-50/50 border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-500'
                         }`}
                       >
                          {p}
                       </button>
                     ))}
                  </div>
               </div>
               
               <div className="space-y-6">
                  {llmForm.provider === 'Ollama' ? (
                    <div className="grid grid-cols-2 gap-6 animate-in fade-in duration-300">
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 ml-1">Endpoint URL</label>
                        <input 
                          type="text" 
                          value={llmForm.baseUrl}
                          onChange={(e) => setLlmForm({ ...llmForm, baseUrl: e.target.value })}
                          placeholder="http://localhost:11434" 
                          className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl px-5 py-4 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all" 
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 ml-1">Model Name</label>
                        <input 
                          type="text" 
                          value={llmForm.model}
                          onChange={(e) => setLlmForm({ ...llmForm, model: e.target.value })}
                          placeholder="e.g. llama3" 
                          className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl px-5 py-4 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all font-mono" 
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6 animate-in fade-in duration-300">
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 ml-1">Security API Key</label>
                        <input 
                          type="password" 
                          value={llmForm.apiKey}
                          onChange={(e) => setLlmForm({ ...llmForm, apiKey: e.target.value })}
                          placeholder={llmForm.provider === 'Groq' ? 'gsk_••••••••••••' : 'sk-••••••••••••'} 
                          className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl px-5 py-4 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all" 
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 ml-1">Model Name</label>
                        <input 
                          type="text" 
                          value={llmForm.model}
                          onChange={(e) => setLlmForm({ ...llmForm, model: e.target.value })}
                          placeholder={llmForm.provider === 'Groq' ? 'llama3-70b-8192' : 'gpt-4'} 
                          className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl px-5 py-4 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all font-mono" 
                        />
                      </div>
                    </div>
                  )}
               </div>
            </div>
          )}

          {/* Test Status Feedback */}
          {testResult && (
            <div className={`mt-8 p-5 rounded-2xl border flex items-start gap-4 animate-in slide-in-from-top-4 duration-500 ${
              testResult.status === 'success' 
                ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                : testResult.status === 'warning'
                  ? 'bg-amber-50 border-amber-100 text-amber-800'
                  : 'bg-rose-50 border-rose-100 text-rose-800'
            }`}>
               <div className="mt-0.5">
                  {testResult.status === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} /> }
               </div>
               <div>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-1">Handshake Status</p>
                  <p className="text-sm font-bold leading-relaxed">{testResult.message || (testResult.status === 'success' ? 'Connection established successfully!' : 'Connection failed.')}</p>
               </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-10 py-8 border-t border-slate-100 flex gap-4 bg-slate-50/50">
           <button 
             onClick={handleTestConnection}
             disabled={isTesting}
             className="flex-[0.4] border border-slate-200 bg-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/30 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
           >
              {isTesting ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              Test
           </button>
           <button 
             onClick={handleSave}
             className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:shadow-xl hover:shadow-blue-200 transition-all flex items-center justify-center gap-2 active:scale-95 group"
           >
              Save Configuration
              <Zap size={16} className="group-hover:fill-current" />
           </button>
        </div>
      </div>
    </div>
  );
};
