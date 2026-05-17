import { useState, useEffect } from 'react'
import { Briefcase, Settings, History, ChevronRight, Share2, Moon, Sun, Database, Search, ClipboardCheck, FileText, CheckCircle2, ShieldCheck, Code2, LogOut, User as UserIcon, Workflow } from 'lucide-react'
import { JiraConnection } from './components/JiraConnection'
import { FetchIssues } from './components/FetchIssues'
import { ReviewIssues } from './components/ReviewIssues'
import { TestPlanView } from './components/TestPlanView'
import { SettingsModal } from './components/SettingsModal'
import { HistoryDashboard } from './components/HistoryDashboard'
import { QualityAudit } from './components/QualityAudit'
import { ApiTesting } from './components/ApiTesting'
import { CICDDashboard } from './components/CICDDashboard'
import { LoginScreen } from './components/LoginScreen'
import { fetchAuthStatus, restoreSession, clearSession, AuthUser } from './services/authService'
import { Connection, LLMConfig, JiraIssue, InputSourceType } from './types'
import { fetchJiraIssues } from './services/jiraFetcher'
import { fetchFromBrd, fetchFromHtml, fetchFromFigma } from './services/inputSources'
import { generateTestPlanResult } from './services/llmNavigator'

function App() {
  const [step, setStep] = useState(1)
  const [view, setView] = useState<'wizard' | 'history' | 'audit' | 'apitest' | 'cicd'>('wizard')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Auth state (only meaningful when the backend's AUTH_ENABLED is true)
  const [authReady, setAuthReady] = useState(false)
  const [authEnabled, setAuthEnabled] = useState(false)
  const [authBootstrap, setAuthBootstrap] = useState(false)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
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

  // Multi-source input state
  const [inputSource, setInputSource] = useState<InputSourceType>('jira')
  const [isFetching, setIsFetching] = useState(false)
  const [sourceLabel, setSourceLabel] = useState<string>('')   // e.g. uploaded filename, URL, figma doc name
  const [brdFile, setBrdFile] = useState<File | null>(null)
  const [htmlUrl, setHtmlUrl] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [figmaUrl, setFigmaUrl] = useState('')
  const [figmaToken, setFigmaToken] = useState('')

  // Boot: ask the backend if auth is enabled, then restore any saved session.
  // If auth is off, the rest of the app behaves identically to before.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await fetchAuthStatus();
        if (cancelled) return;
        setAuthEnabled(status.enabled);
        setAuthBootstrap(status.enabled && !status.anyUserExists);
        if (status.enabled) {
          const session = restoreSession();
          if (session) setAuthUser(session.user);
        }
      } catch {
        // Backend not reachable yet — let the rest of the app retry on its own
        // calls; treat as auth-off so the UI doesn't get stuck.
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleAuthenticated = (user: AuthUser) => {
    setAuthUser(user);
    setAuthBootstrap(false);
  };

  const handleLogout = () => {
    clearSession();
    setAuthUser(null);
  };

  // Load from local storage on init
  useEffect(() => {
    const savedConnections = localStorage.getItem('tp_connections')
    const savedLlm = localStorage.getItem('tp_llm_config')
    const savedProduct = localStorage.getItem('tp_product_name')
    const savedProject = localStorage.getItem('tp_project_key')
    const savedSprint = localStorage.getItem('tp_sprint_version')
    const savedContext = localStorage.getItem('tp_additional_context')

    if (savedConnections) {
      const conns = JSON.parse(savedConnections);
      setConnections(conns);
      if (conns.length > 0) setActiveConnection(conns[0]);
    }
    if (savedLlm) setLlmConfig(JSON.parse(savedLlm))
    if (savedProduct) setProductName(savedProduct)
    if (savedProject) setProjectKey(savedProject)
    if (savedSprint) setSprintVersion(savedSprint)
    if (savedContext) setAdditionalContext(savedContext)

    // Auto-detect system preference if no saved theme
    const savedTheme = localStorage.getItem('tp_theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, [])

  // Auto-save project setup
  useEffect(() => {
    localStorage.setItem('tp_product_name', productName);
    localStorage.setItem('tp_project_key', projectKey);
    localStorage.setItem('tp_sprint_version', sprintVersion);
    localStorage.setItem('tp_additional_context', additionalContext);
  }, [productName, projectKey, sprintVersion, additionalContext]);

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
    switch (step) {
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
        inputSource={inputSource}
        setInputSource={setInputSource}
        brdFile={brdFile}
        setBrdFile={setBrdFile}
        htmlUrl={htmlUrl}
        setHtmlUrl={setHtmlUrl}
        htmlBody={htmlBody}
        setHtmlBody={setHtmlBody}
        figmaUrl={figmaUrl}
        setFigmaUrl={setFigmaUrl}
        figmaToken={figmaToken}
        setFigmaToken={setFigmaToken}
        isFetching={isFetching}
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
        sourceLabel={sourceLabel}
        inputSource={inputSource}
      />;
      case 4: return <TestPlanView
        plan={generatedPlan}
        productName={productName}
        llmConfig={llmConfig}
        connection={activeConnection}
        projectKey={projectKey}
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
    // Per-source validation up front — fail fast with a clear message rather
    // than dispatching a request that will 4xx server-side.
    if (inputSource === 'jira' && !activeConnection) {
      alert("Please configure a Jira connection first!");
      return;
    }
    if (inputSource === 'brd' && !brdFile) {
      alert("Please select a BRD file to upload.");
      return;
    }
    if (inputSource === 'html' && !htmlUrl.trim() && !htmlBody.trim()) {
      alert("Please enter a URL or paste HTML content.");
      return;
    }
    if (inputSource === 'figma' && (!figmaUrl.trim() || !figmaToken.trim())) {
      alert("Please enter both a Figma URL and a personal access token.");
      return;
    }

    setIsFetching(true);
    try {
      let issues: JiraIssue[] = [];
      let label = '';
      switch (inputSource) {
        case 'jira': {
          issues = await fetchJiraIssues(activeConnection!, projectKey, sprintVersion);
          label = `${activeConnection!.name} · ${projectKey}`;
          break;
        }
        case 'brd': {
          const r = await fetchFromBrd(brdFile!);
          issues = r.items;
          label = r.label;
          break;
        }
        case 'html': {
          const r = await fetchFromHtml(
            htmlUrl.trim() ? { url: htmlUrl.trim() } : { html: htmlBody }
          );
          issues = r.items;
          label = r.label;
          break;
        }
        case 'figma': {
          const r = await fetchFromFigma(figmaUrl.trim(), figmaToken.trim());
          issues = r.items;
          label = r.label;
          break;
        }
      }
      setFetchedIssues(issues);
      setSourceLabel(label);
      setStep(3);
    } catch (error: any) {
      alert("Failed to fetch requirements: " + error.message);
    } finally {
      setIsFetching(false);
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

  const stepsMeta = [
    { id: 1, name: 'Setup', subtitle: 'Jira Connection', icon: Database },
    { id: 2, name: 'Fetch Issues', subtitle: 'Query & Filter', icon: Search },
    { id: 3, name: 'Review', subtitle: 'Validate & Context', icon: ClipboardCheck },
    { id: 4, name: 'Generate & Execute', subtitle: 'Plan, Run & Report', icon: FileText },
  ];

  // Auth gate — short-circuit when auth is enabled and we don't yet have a user.
  // Loading state is rendered so we don't briefly flash the wizard before the
  // login screen appears.
  if (!authReady) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">Loading…</div>;
  }
  if (authEnabled && !authUser) {
    return <LoginScreen bootstrapMode={authBootstrap} onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-300 flex">

      {/* ─── Vertical Sidebar ─── */}
      <aside className="w-[280px] min-h-screen flex flex-col bg-white/80 backdrop-blur-xl border-r border-slate-200/80 dark:bg-slate-900/90 dark:border-slate-800 sticky top-0 h-screen z-30 shadow-xl shadow-slate-200/30 dark:shadow-slate-950/50">

        {/* Brand */}
        <div className="px-6 pt-7 pb-6 border-b border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-2.5 rounded-2xl text-white shadow-lg shadow-blue-300/40 ring-4 ring-blue-50 dark:shadow-blue-900/30 dark:ring-slate-800">
              <Briefcase size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-[13px] font-black tracking-tight text-slate-800 dark:text-slate-100 leading-tight">Intelligent Test<br/>Planning Agent</h1>
              <p className="text-[8px] text-slate-400 font-black uppercase tracking-[0.15em] mt-0.5 dark:text-slate-500">B.L.A.S.T Protocol</p>
            </div>
          </div>
        </div>

        {/* Navigation Steps */}
        <nav className="flex-1 px-5 py-8">
          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500 mb-6 px-2">Workflow</p>
          <div className="space-y-1">
            {stepsMeta.map((s, index) => {
              const Icon = s.icon;
              const isActive = step === s.id;
              const isCompleted = step > s.id;
              const isClickable = step > s.id;
              const isLast = index === stepsMeta.length - 1;

              return (
                <div key={s.id} className="relative">
                  {/* Connector line */}
                  {!isLast && (
                    <div className="absolute left-[23px] top-[52px] w-[2px] h-[20px] z-0">
                      <div className={`w-full h-full rounded-full transition-colors duration-500 ${isCompleted ? 'bg-blue-400 dark:bg-blue-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                    </div>
                  )}

                  {/* Step Button */}
                  <button
                    onClick={() => isClickable && setStep(s.id)}
                    className={`relative z-10 w-full flex items-center gap-4 px-3 py-3.5 rounded-2xl transition-all duration-300 group
                      ${isActive
                        ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-xl shadow-blue-300/30 dark:shadow-blue-900/40 scale-[1.02]'
                        : isCompleted
                          ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50/60 dark:hover:bg-slate-800/60 cursor-pointer'
                          : 'text-slate-300 dark:text-slate-600 cursor-default'
                      }`}
                  >
                    {/* Icon circle */}
                    <div className={`w-[38px] h-[38px] rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300
                      ${isActive
                        ? 'bg-white/20 ring-2 ring-white/30'
                        : isCompleted
                          ? 'bg-blue-100 dark:bg-blue-900/40 ring-2 ring-blue-200 dark:ring-blue-800'
                          : 'bg-slate-100 dark:bg-slate-800 ring-2 ring-slate-200 dark:ring-slate-700'
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 size={18} className="text-blue-500 dark:text-blue-400" />
                      ) : (
                        <Icon size={18} className={isActive ? 'text-white' : ''} />
                      )}
                    </div>

                    {/* Text */}
                    <div className="text-left flex-1 min-w-0">
                      <p className={`text-[11px] font-black uppercase tracking-[0.15em] leading-tight truncate
                        ${isActive ? 'text-white' : isCompleted ? 'text-slate-700 dark:text-slate-200' : 'text-slate-300 dark:text-slate-600'}`}>
                        {s.name}
                      </p>
                      <p className={`text-[9px] mt-0.5 truncate
                        ${isActive ? 'text-blue-100' : isCompleted ? 'text-slate-400 dark:text-slate-500' : 'text-slate-300 dark:text-slate-700'}`}>
                        {s.subtitle}
                      </p>
                    </div>

                    {/* Arrow indicator for active */}
                    {isActive && (
                      <ChevronRight size={14} className="text-white/60 flex-shrink-0" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </nav>

        {/* Sidebar Footer Actions */}
        <div className="px-5 pb-6 space-y-2 border-t border-slate-100 dark:border-slate-800/60 pt-5">
          <button
            onClick={() => setView(view === 'history' ? 'wizard' : 'history')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              view === 'history'
                ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20'
                : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50/50 dark:text-slate-500 dark:hover:text-blue-400 dark:hover:bg-slate-800/50'
            }`}
          >
            <History size={15} />
            {view === 'history' ? 'Back to Wizard' : 'History'}
          </button>
          <button
            onClick={() => setView(view === 'audit' ? 'wizard' : 'audit')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              view === 'audit'
                ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20'
                : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50/50 dark:text-slate-500 dark:hover:text-blue-400 dark:hover:bg-slate-800/50'
            }`}
          >
            <ShieldCheck size={15} />
            {view === 'audit' ? 'Back to Wizard' : 'Quality Audit'}
          </button>
          <button
            onClick={() => setView(view === 'apitest' ? 'wizard' : 'apitest')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              view === 'apitest'
                ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20'
                : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50/50 dark:text-slate-500 dark:hover:text-blue-400 dark:hover:bg-slate-800/50'
            }`}
          >
            <Code2 size={15} />
            {view === 'apitest' ? 'Back to Wizard' : 'API Testing'}
          </button>
          <button
            onClick={() => setView(view === 'cicd' ? 'wizard' : 'cicd')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              view === 'cicd'
                ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20'
                : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50/50 dark:text-slate-500 dark:hover:text-blue-400 dark:hover:bg-slate-800/50'
            }`}
          >
            <Workflow size={15} />
            {view === 'cicd' ? 'Back to Wizard' : 'CI / CD'}
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all dark:text-slate-500 dark:hover:text-blue-400 dark:hover:bg-slate-800/50"
          >
            <Settings size={15} />
            Settings
          </button>
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all dark:text-slate-500 dark:hover:text-blue-400 dark:hover:bg-slate-800/50"
          >
            {isDarkMode ? <Sun size={15} /> : <Moon size={15} />}
            {isDarkMode ? 'Light Mode' : 'Dark Mode'}
          </button>

          {authEnabled && authUser && (
            <div className="mt-2 pt-3 border-t border-slate-100 dark:border-slate-800/60">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <UserIcon size={13} className="text-slate-500 dark:text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-slate-700 dark:text-slate-200 truncate">{authUser.username}</p>
                  <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{authUser.role}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  title="Sign out"
                >
                  <LogOut size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top Bar */}
        <header className="bg-white/60 backdrop-blur-md border-b border-slate-200/60 px-6 py-4 flex justify-between items-center sticky top-0 z-20 dark:bg-slate-900/60 dark:border-slate-800/60">
          <div>
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 tracking-tight">
              {view === 'history'
                ? 'Run History & Analytics'
                : view === 'audit'
                  ? 'Quality Audit'
                  : view === 'apitest'
                    ? 'API Testing'
                    : view === 'cicd'
                      ? 'CI / CD'
                      : stepsMeta.find(s => s.id === step)?.name}
            </h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.15em] dark:text-slate-500">
              {view === 'history'
                ? 'Trend, flakiness & past executions'
                : view === 'audit'
                  ? 'Visual regression & accessibility scans'
                  : view === 'apitest'
                    ? 'REST endpoint tests with assertions'
                    : view === 'cicd'
                      ? 'GitHub Actions runs, status & manual trigger'
                      : `Step ${step} of ${stepsMeta.length} • ${stepsMeta.find(s => s.id === step)?.subtitle}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-slate-200/90 dark:bg-slate-800/90 rounded-full px-4 py-2 ring-1 ring-slate-300/80 dark:ring-slate-700 shadow-sm">
              {stepsMeta.map((s) => (
                <div
                  key={s.id}
                  className={`transition-all duration-500 ${
                    step === s.id
                      ? 'w-7 h-3 rounded-full bg-blue-600 shadow-lg shadow-blue-500/25'
                      : step > s.id
                        ? 'w-3 h-3 rounded-full bg-blue-400 dark:bg-blue-500'
                        : 'w-3 h-3 rounded-full bg-slate-400 dark:bg-slate-600'
                  }`}
                />
              ))}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 p-4">
          <div className="bg-white border border-slate-200/80 rounded-[2rem] p-6 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.06)] min-h-[600px] flex flex-col transition-all duration-700 ease-out dark:bg-slate-900 dark:border-slate-800 dark:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.4)]">
            <div className="flex-1 animate-in fade-in slide-in-from-bottom-4 duration-700">
              {view === 'history'
                ? <HistoryDashboard onBack={() => setView('wizard')} />
                : view === 'audit'
                  ? <QualityAudit onBack={() => setView('wizard')} />
                  : view === 'apitest'
                    ? <ApiTesting onBack={() => setView('wizard')} />
                    : view === 'cicd'
                      ? <CICDDashboard onBack={() => setView('wizard')} />
                      : renderStep()}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="px-10 py-6 text-center opacity-30">
          <p className="text-[9px] font-black uppercase tracking-[0.5em] text-slate-400">Master System Pilot • Antigravity AI</p>
        </footer>
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
    </div>
  )
}

export default App
