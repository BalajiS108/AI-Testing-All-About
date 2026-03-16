import { useState, useEffect } from 'react';
import { Settings, MessageSquare, PlusCircle } from 'lucide-react';
import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';
type Provider = 'ollama' | 'openai' | 'groq' | 'claude';

function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'settings'>('chat');
  const [requirementText, setRequirementText] = useState('');
  const [generatedResult, setGeneratedResult] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider>('ollama');

  const [settings, setSettings] = useState({
    ollamaUrl: 'http://localhost:11434',
    groqKey: '',
    openaiKey: '',
    claudeKey: ''
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    axios.get(`${API_BASE}/settings`)
      .then(res => {
        if (res.data) {
          setSettings({
            ollamaUrl: res.data.ollamaUrl || 'http://localhost:11434',
            groqKey: res.data.groqKey || '',
            openaiKey: res.data.openaiKey || '',
            claudeKey: res.data.claudeKey || ''
          });
        }
      })
      .catch(err => console.error("Failed to load settings:", err));
  }, []);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await axios.post(`${API_BASE}/settings`, settings);
      alert('Settings saved successfully!');
    } catch (err) {
      console.error("Failed to save settings:", err);
      alert('Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async (provider: Provider) => {
    try {
      await axios.post(`${API_BASE}/generate`, {
        requirement: "Ping connection",
        provider: provider
      });
      alert(`Connection to ${provider} successful!`);
    } catch (error: any) {
      console.error(`Connection test for ${provider} failed:`, error);
      alert(`Connection to ${provider} failed: ${error.response?.data?.error || error.message}`);
    }
  };

  const generateTestCases = async () => {
    if (!requirementText.trim()) return;

    setIsGenerating(true);
    setGeneratedResult('');
    try {
      const response = await axios.post(`${API_BASE}/generate`, {
        requirement: requirementText,
        provider: selectedProvider
      });
      setGeneratedResult(response.data.result);
    } catch (error: any) {
      console.error("Generation error:", error);
      setGeneratedResult(`Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex h-screen bg-neutral-900 text-white font-sans">
      {/* Sidebar */}
      <div className="w-64 border-r border-neutral-800 flex flex-col">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <h1 className="font-bold text-lg text-emerald-400">LLM TestGen</h1>
          <button
            onClick={() => { setRequirementText(''); setGeneratedResult(''); setActiveTab('chat'); }}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            <PlusCircle size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {/* History Item Placeholder */}
          <button className="w-full text-left px-3 py-2 rounded-md bg-neutral-800 text-sm text-neutral-300 hover:bg-neutral-700 transition">
            Login Page API Tests
          </button>
          <button className="w-full text-left px-3 py-2 rounded-md hover:bg-neutral-800 text-sm text-neutral-400 transition">
            User Profile E2E Tests
          </button>
        </div>

        <div className="p-4 border-t border-neutral-800 flex flex-col gap-2">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${activeTab === 'chat' ? 'bg-emerald-500/10 text-emerald-400' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}
          >
            <MessageSquare size={18} />
            <span className="text-sm font-medium">Test Generator</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${activeTab === 'settings' ? 'bg-emerald-500/10 text-emerald-400' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}
          >
            <Settings size={18} />
            <span className="text-sm font-medium">API Settings</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-neutral-950">
        {activeTab === 'chat' ? (
          <div className="flex-1 flex flex-col justify-between">
            {/* Chat History Area */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
              {!generatedResult && !isGenerating && (
                <div className="self-center bg-neutral-900 border border-neutral-800 text-neutral-400 text-sm px-4 py-2 rounded-full mb-4">
                  Welcome to Local LLM Test Generator
                </div>
              )}

              {/* AI Message Area */}
              {(generatedResult || isGenerating) && (
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 max-w-4xl w-full self-center shadow-sm">
                  <h2 className="text-lg font-semibold text-emerald-400 mb-2">Test Cases Generated ({selectedProvider})</h2>
                  <div className="text-sm text-neutral-300 space-y-3">
                    {isGenerating ? (
                      <div className="flex items-center gap-3">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-500"></div>
                        <p className="animate-pulse">Generating test cases...</p>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed overflow-x-auto text-emerald-50">
                        {generatedResult}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="p-6 bg-neutral-950 border-t border-neutral-800/50">
              <div className="max-w-4xl mx-auto relative flex flex-col gap-2">
                <div className="flex justify-between items-center px-1">
                  <div className="text-xs text-neutral-400 font-medium">Requirements</div>
                  <select
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value as Provider)}
                    className="bg-neutral-900 border border-neutral-700 text-white text-xs rounded px-2 py-1 outline-none"
                  >
                    <option value="ollama">Ollama (Local)</option>
                    <option value="openai">OpenAI</option>
                    <option value="claude">Claude</option>
                    <option value="groq">Groq</option>
                  </select>
                </div>
                <div className="relative">
                  <textarea
                    value={requirementText}
                    onChange={(e) => setRequirementText(e.target.value)}
                    placeholder="Ask here or paste TC for Requirement..."
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 min-h-[120px] text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none shadow-lg shadow-black/20 pb-12"
                  />
                  <div className="absolute bottom-3 right-3 flex items-center gap-2">
                    <button
                      onClick={generateTestCases}
                      disabled={isGenerating || !requirementText.trim()}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                    >
                      Generate Test Cases
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-8 items-center justify-center">
            {/* Settings View */}
            <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl overflow-hidden overflow-y-auto max-h-full">
              <div className="p-6 border-b border-neutral-800 bg-neutral-900/50 flex justify-between items-center sticky top-0 z-10">
                <div>
                  <h2 className="text-xl font-semibold text-white">LLM Provider Settings</h2>
                  <p className="text-sm text-neutral-400 mt-1">Configure your local and cloud AI providers here.</p>
                </div>
                <button
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors"
                >
                  {isSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Ollama */}
                <div className="space-y-2 relative">
                  <label className="text-sm font-medium text-neutral-300">Ollama API URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={settings.ollamaUrl}
                      onChange={(e) => setSettings({ ...settings, ollamaUrl: e.target.value })}
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <button onClick={() => handleTestConnection('ollama')} className="px-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-sm text-neutral-300 transition-colors">Test</button>
                  </div>
                </div>

                {/* Grok */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-300">Groq API Key</label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="gsk_..."
                      value={settings.groqKey}
                      onChange={(e) => setSettings({ ...settings, groqKey: e.target.value })}
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <button onClick={() => handleTestConnection('groq')} className="px-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-sm text-neutral-300 transition-colors">Test</button>
                  </div>
                </div>

                {/* OpenAI */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-300">OpenAI API Key</label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={settings.openaiKey}
                      onChange={(e) => setSettings({ ...settings, openaiKey: e.target.value })}
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <button onClick={() => handleTestConnection('openai')} className="px-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-sm text-neutral-300 transition-colors">Test</button>
                  </div>
                </div>

                {/* Claude */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-300">Anthropic Claude API Key</label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="sk-ant-..."
                      value={settings.claudeKey}
                      onChange={(e) => setSettings({ ...settings, claudeKey: e.target.value })}
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <button onClick={() => handleTestConnection('claude')} className="px-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-sm text-neutral-300 transition-colors">Test</button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
