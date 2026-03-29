import { useState, useEffect } from 'react'
import { Briefcase, Settings, History, ChevronRight, Share2, Moon, Sun } from 'lucide-react'
import { JiraConnection } from './components/JiraConnection'
import { FetchIssues } from './components/FetchIssues'
import { ReviewIssues } from './components/ReviewIssues'
import { TestPlanView } from './components/TestPlanView'
import { SettingsModal } from './components/SettingsModal'
import { Connection, LLMConfig, JiraIssue } from './types'
import { fetchJiraIssues } from './services/jiraFetcher'
import { generateTestPlanResult } from './services/llmNavigator'

function App() {
  const [step, setStep] = useState(1)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [connections, setConnections] = useState<Connection[]>([])
  const [activeConnection, setActiveConnection] = useState<Connection | null>(null)
  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null)
  const [fetchedIssues, setFetchedIssues] = useState<JiraIssue[]>([])
  const [generatedPlan, setGeneratedPlan] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [productName, setProductName] = useState('')
  const [projectKey, setProjectKey] = useState('')
  const [sprintVersion, setSprintVersion] = useState('')
  const [additionalContext, setAdditionalContext] = useState('')
  const [outputType, setOutputType] = useState<'plan' | 'cases'>('plan')
  const [isDarkMode, setIsDarkMode] = useState(false)

  // Load from local storage on init
  useEffect(() => {
    const savedConnections = localStorage.getItem('tp_connections')
    const savedLlm = localStorage.getItem('tp_llm_config')
    if (savedConnections) setConnections(JSON.parse(savedConnections))
    if (savedLlm) setLlmConfig(JSON.parse(savedLlm))
    
    // Auto-detect system preference if no saved theme
    const savedTheme = localStorage.getItem('tp_theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, [])

  const toggleTheme = () => {
    const newTheme = !isDarkMode ? 'dark' : 'light';
    setIsDarkMode(!isDarkMode);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('tp_theme', newTheme);
  };

  const handleSelectConnection = (id: string) => {
    const conn = connections.find(c => c.id === id);
    if (conn) setActiveConnection(conn);
  };

  const renderStep = () => {
    switch(step) {
      case 1: return <JiraConnection 
                activeConnection={activeConnection}
                connections={connections}
                onSelectConnection={handleSelectConnection}
                onAddConnection={() => setIsSettingsOpen(true)}
                onContinue={() => setStep(2)} 
              />;
      case 2: return <FetchIssues 
                activeConnection={activeConnection}
                productName={productName}
                setProductName={setProductName}
                projectKey={projectKey}
                setProjectKey={setProjectKey}
                sprintVersion={sprintVersion}
                setSprintVersion={setSprintVersion}
                additionalContext={additionalContext}
                setAdditionalContext={setAdditionalContext}
                onFetch={handleFetchIssues} 
                onBack={() => setStep(1)} 
              />;
      case 3: return <ReviewIssues 
                activeConnection={activeConnection}
                issues={fetchedIssues}
                additionalContext={additionalContext}
                setAdditionalContext={setAdditionalContext}
                outputType={outputType}
                setOutputType={setOutputType}
                onGenerate={handleGeneratePlan} 
                isGenerating={isGenerating}
              />;
      case 4: return <TestPlanView 
                plan={generatedPlan} 
                productName={productName}
              />;
      default: return <JiraConnection 
                activeConnection={activeConnection}
                connections={connections}
                onSelectConnection={handleSelectConnection}
                onAddConnection={() => setIsSettingsOpen(true)}
                onContinue={() => setStep(2)} 
              />;
    }
  }

  const handleFetchIssues = async () => {
    if (!activeConnection) {
      alert("Please configure a Jira connection first!");
      return;
    }
    setStep(3); // Navigate to Review
    try {
      const issues = await fetchJiraIssues(activeConnection, projectKey, sprintVersion);
      setFetchedIssues(issues);
    } catch (error: any) {
      alert("Failed to fetch issues: " + error.message);
      setStep(2);
    }
  };

  const handleGeneratePlan = async () => {
    if (!llmConfig) {
      setIsSettingsOpen(true);
      return;
    }
    setIsGenerating(true);
    setStep(4);
    try {
      const plan = await generateTestPlanResult(llmConfig, productName, fetchedIssues, additionalContext, outputType);
      setGeneratedPlan(plan);
    } catch (error: any) {
      alert("Generation failed: " + error.message);
      setStep(3);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveConnections = (newConns: Connection[]) => {
    setConnections(newConns);
    localStorage.setItem('tp_connections', JSON.stringify(newConns));
    if (newConns.length > 0) setActiveConnection(newConns[0]);
  };

  const handleSaveLLM = (config: LLMConfig) => {
    setLlmConfig(config);
    localStorage.setItem('tp_llm_config', JSON.stringify(config));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-300">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-8 py-4 flex justify-between items-center sticky top-0 z-40 transition-shadow hover:shadow-sm dark:bg-slate-900/80 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2.5 rounded-2xl text-white shadow-lg shadow-blue-200 ring-4 ring-blue-50 dark:shadow-blue-900/20 dark:ring-slate-800">
            <Briefcase size={22} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-slate-800 dark:text-slate-100">Intelligent Test Planning Agent</h1>
            <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] dark:text-slate-500">B.L.A.S.T Protocol • Standardized Logic</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 bg-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all text-slate-500 hover:text-blue-600 active:scale-95 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-blue-400">
            <History size={14} />
            History
          </button>
          <button 
            onClick={toggleTheme}
            className="p-2.5 border border-slate-200 bg-white rounded-xl hover:bg-slate-50 transition-all text-slate-500 hover:text-blue-600 shadow-sm active:scale-95 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-blue-400"
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2.5 border border-slate-200 bg-white rounded-xl hover:bg-slate-50 transition-all text-slate-500 hover:text-blue-600 shadow-sm active:scale-95 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-blue-400"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Stepper Dashboard */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="bg-white border border-slate-200 rounded-[2rem] p-3 flex items-center justify-between mb-16 shadow-2xl shadow-slate-200/50 dark:bg-slate-900 dark:border-slate-800 dark:shadow-slate-900/50">
          {[
            { id: 1, name: 'Setup' },
            { id: 2, name: 'Fetch Issues' },
            { id: 3, name: 'Review' },
            { id: 4, name: 'Plan' }
          ].map((s) => (
            <div 
              key={s.id}
              onClick={() => step > s.id && setStep(s.id)}
              className={`flex-1 flex items-center justify-center gap-3 py-4 px-8 rounded-2xl transition-all duration-300 cursor-pointer ${
                step === s.id 
                  ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white font-black shadow-xl shadow-blue-200 dark:shadow-blue-900/30 scale-[1.02]' 
                  : step > s.id 
                    ? 'text-blue-600 font-bold hover:bg-blue-50/50 dark:text-blue-400 dark:hover:bg-slate-800' 
                    : 'text-slate-300 font-bold dark:text-slate-600'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] border-2 ${
                step >= s.id ? 'border-current' : 'border-slate-200 dark:border-slate-700'
              }`}>
                {s.id}
              </div>
              <span className="text-[11px] uppercase tracking-[0.2em]">{s.name}</span>
            </div>
          ))}
        </div>

        {/* Dynamic Content */}
        <main className="bg-white border border-slate-200 rounded-[3rem] p-16 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] min-h-[600px] flex flex-col transition-all duration-700 ease-out transform translate-y-0 dark:bg-slate-900 dark:border-slate-800 dark:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.4)]">
             <div className="flex-1 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {renderStep()}
             </div>
        </main>
      </div>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        connections={connections}
        onSaveConnections={handleSaveConnections}
        llmConfig={llmConfig}
        onSaveLLM={handleSaveLLM}
      />

      {/* Footer Info */}
      <footer className="max-w-6xl mx-auto px-4 py-12 text-center opacity-40">
         <p className="text-[9px] font-black uppercase tracking-[0.5em] text-slate-400">Master System Pilot • Antigravity AI</p>
      </footer>
    </div>
  )
}

export default App
