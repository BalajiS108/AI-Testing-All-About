import React, { useState } from 'react';
import {
  FileText, Download, Clipboard, RefreshCcw, Play,
  CheckCircle2, XCircle, AlertTriangle, Clock,
  ChevronDown, ChevronRight, BarChart3, FileSpreadsheet,
  Zap, Activity, Video
} from 'lucide-react';

interface StepResult {
  step: string;
  result: string;
  passed: boolean;
}

interface TestCaseResult {
  id: number;
  name: string;
  jiraKey: string;
  priority: string;
  status: 'PASS' | 'FAIL' | 'SKIPPED' | 'ERROR';
  steps: StepResult[];
  expectedResult: string;
  actualResult: string;
  duration: number;
  error?: string;
  videoFile?: string;
}

interface ExecutionReport {
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
    duration: number;
    executedAt: string;
  };
  results: TestCaseResult[];
}

interface TestPlanViewProps {
  plan: string;
  productName: string;
  llmConfig: any;
}

export const TestPlanView: React.FC<TestPlanViewProps> = ({ plan, productName, llmConfig }) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [report, setReport] = useState<ExecutionReport | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [reportDownloadUrl, setReportDownloadUrl] = useState<string | null>(null);
  const [expandedCases, setExpandedCases] = useState<Set<number>>(new Set());
  const [executionProgress, setExecutionProgress] = useState({
    currentCase: '',
    progress: 0,
    total: 0
  });

  const copyToClipboard = () => {
    navigator.clipboard.writeText(plan);
    alert("Copied to clipboard!");
  };

  const downloadMarkdown = () => {
    const element = document.createElement("a");
    const file = new Blob([plan], { type: 'text/markdown' });
    element.href = URL.createObjectURL(file);
    element.download = `${productName}_TestPlan.md`;
    document.body.appendChild(element);
    element.click();
  };

  const executeTests = async () => {
    setIsExecuting(true);
    setExecutionError(null);
    setReport(null);
    setExecutionProgress({ currentCase: 'Starting...', progress: 0, total: 0 });

    const statusInterval = setInterval(async () => {
      try {
        const res = await fetch('http://127.0.0.1:3001/api/execution-status');
        const data = await res.json();
        if (data.isRunning) {
          setExecutionProgress({
            currentCase: data.currentCase,
            progress: data.progress,
            total: data.total
          });
        }
      } catch (e) { }
    }, 1000);

    try {
      const response = await fetch('http://127.0.0.1:3001/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testCases: plan, llmConfig })
      });
      const data = await response.json();
      if (data.success) {
        setReport(data.report);
        setReportDownloadUrl(data.reportDownloadUrl ? `http://127.0.0.1:3001${data.reportDownloadUrl}` : null);
      } else {
        setExecutionError(data.error || 'Execution failed.');
      }
    } catch (err: any) {
      setExecutionError("Failed to connect to backend. Ensure the backend server is running on port 3001.");
    } finally {
      clearInterval(statusInterval);
      setIsExecuting(false);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedCases(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'PASS': return <CheckCircle2 size={18} className="text-emerald-500" />;
      case 'FAIL': return <XCircle size={18} className="text-red-500" />;
      case 'ERROR': return <AlertTriangle size={18} className="text-orange-500" />;
      default: return <Clock size={18} className="text-slate-400" />;
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      PASS: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
      FAIL: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
      ERROR: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800',
      SKIPPED: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${colors[status] || colors.SKIPPED}`}>
        {status}
      </span>
    );
  };

  const priorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      high: 'text-red-600 bg-red-50 border-red-200',
      medium: 'text-orange-600 bg-orange-50 border-orange-200',
      low: 'text-blue-600 bg-blue-50 border-blue-200',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${colors[priority.toLowerCase()] || colors.medium}`}>
        {priority}
      </span>
    );
  };

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Header Section */}
      <div className="flex justify-between items-center mb-10">
        <div>
          <h2 className="text-3xl font-bold text-slate-800 tracking-tight dark:text-slate-100">
            {report ? 'Execution Report' : 'Standardized Test Plan'}
          </h2>
          <p className="text-slate-500 font-medium tracking-wide dark:text-slate-400">Product: {productName || 'Default Project'}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-2 px-5 py-3 border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all text-slate-600 active:scale-95 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Clipboard size={16} />
            Copy
          </button>
          <button
            onClick={downloadMarkdown}
            className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95 dark:shadow-blue-900/30"
          >
            <Download size={16} />
            Download MD
          </button>
          <button
            onClick={executeTests}
            disabled={isExecuting || !plan}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-sm font-bold hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg shadow-emerald-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed dark:shadow-emerald-900/30"
          >
            {isExecuting ? <RefreshCcw size={16} className="animate-spin" /> : <Play size={16} />}
            {isExecuting ? 'Running...' : 'Run Tests'}
          </button>
        </div>
      </div>

      {/* Execution Progress Bar */}
      {isExecuting && (
        <div className="mb-8 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-6 dark:from-emerald-900/20 dark:to-teal-900/20 dark:border-emerald-800">
          <div className="flex items-center gap-6">
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin dark:border-emerald-800 dark:border-t-emerald-400" />
              <Zap size={24} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-end mb-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 mb-1">Live Automation Suite</p>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 transition-all duration-500">
                    {executionProgress.currentCase || 'Initializing...'}
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {executionProgress.total > 0
                      ? Math.round((executionProgress.progress / executionProgress.total) * 100)
                      : 0}%
                  </span>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Test {executionProgress.progress || 0} of {executionProgress.total || 0}
                  </p>
                </div>
              </div>
              <div className="h-4 bg-emerald-100/50 rounded-full overflow-hidden p-1 dark:bg-emerald-900/30">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-700 ease-out shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                  style={{ width: `${executionProgress.total > 0 ? (executionProgress.progress / executionProgress.total) * 100 : 5}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {executionError && (
        <div className="mb-8 bg-red-50 border border-red-200 rounded-2xl p-6 flex items-start gap-4 dark:bg-red-900/20 dark:border-red-800">
          <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-bold text-red-700 dark:text-red-400">Execution Failed</p>
            <p className="text-sm text-red-600 dark:text-red-300 mt-1">{executionError}</p>
          </div>
        </div>
      )}

      {/* ═══════════════ EXECUTION REPORT ═══════════════ */}
      {report && (
        <div className="space-y-6 mb-10">

          {/* Summary Dashboard */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-lg dark:bg-slate-900 dark:border-slate-800">
            <div className="px-8 py-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-800/50 dark:border-slate-700">
              <BarChart3 size={20} className="text-blue-600 dark:text-blue-400" />
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Execution Summary</h3>
              <span className="ml-auto text-xs text-slate-400 font-medium">
                {new Date(report.summary.executedAt).toLocaleString()}
              </span>
            </div>

            <div className="p-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <StatCard label="Total" value={report.summary.total} color="blue" />
                <StatCard label="Passed" value={report.summary.passed} color="emerald" />
                <StatCard label="Failed" value={report.summary.failed} color="red" />
                <StatCard label="Errors" value={report.summary.errors} color="orange" />
                <StatCard label="Duration" value={`${(report.summary.duration / 1000).toFixed(1)}s`} color="purple" />
              </div>

              {/* Pass Rate Bar */}
              <div className="bg-slate-50 rounded-xl p-4 dark:bg-slate-800">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Pass Rate</span>
                  <span className="text-2xl font-black text-slate-800 dark:text-slate-100">
                    {report.summary.total > 0 ? Math.round((report.summary.passed / report.summary.total) * 100) : 0}%
                  </span>
                </div>
                <div className="h-4 bg-slate-200 rounded-full overflow-hidden dark:bg-slate-700">
                  <div
                    className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{
                      width: `${report.summary.total > 0 ? (report.summary.passed / report.summary.total) * 100 : 0}%`,
                      background: `linear-gradient(90deg, #10b981, #14b8a6)`
                    }}
                  />
                  {report.summary.failed > 0 && (
                    <div
                      className="h-full rounded-r-full -mt-4"
                      style={{
                        width: `${(report.summary.failed / report.summary.total) * 100}%`,
                        marginLeft: `${(report.summary.passed / report.summary.total) * 100}%`,
                        background: `linear-gradient(90deg, #ef4444, #f97316)`
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Test Case Results */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-lg dark:bg-slate-900 dark:border-slate-800">
            <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <Activity size={20} className="text-purple-600 dark:text-purple-400" />
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Detailed Results</h3>
              </div>
              {reportDownloadUrl && (
                <a
                  href={reportDownloadUrl}
                  download
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-md active:scale-95"
                >
                  <FileSpreadsheet size={14} />
                  Export Excel Report
                </a>
              )}
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {report.results.map(tc => (
                <div key={tc.id} className="group">
                  {/* Test Case Header Row */}
                  <div
                    onClick={() => toggleExpand(tc.id)}
                    className="px-8 py-5 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors dark:hover:bg-slate-800/50"
                  >
                    <div className="flex-shrink-0 transition-transform">
                      {expandedCases.has(tc.id) ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                    </div>

                    {statusIcon(tc.status)}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded tracking-widest border border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
                          {tc.jiraKey}
                        </span>
                        {priorityBadge(tc.priority)}
                      </div>
                      <h4 className="text-sm font-bold text-slate-800 truncate dark:text-slate-200">{tc.name}</h4>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-xs text-slate-400 font-medium">
                        <Clock size={12} className="inline mr-1" />
                        {(tc.duration / 1000).toFixed(1)}s
                      </span>
                      {statusBadge(tc.status)}
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {expandedCases.has(tc.id) && (
                    <div className="px-8 pb-6 bg-slate-50/50 border-t border-slate-100 dark:bg-slate-800/30 dark:border-slate-700">
                      <div className="grid grid-cols-2 gap-6 py-4">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Expected Result</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300">{tc.expectedResult || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Actual Result</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300">{tc.actualResult || 'N/A'}</p>
                        </div>
                      </div>

                      {tc.error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 dark:bg-red-900/20 dark:border-red-800">
                          <p className="text-xs font-bold text-red-600 dark:text-red-400">Error: {tc.error}</p>
                        </div>
                      )}

                      {/* Step-by-step Results */}
                      {tc.steps.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Step-by-Step Execution</p>
                          <div className="space-y-2">
                            {tc.steps.map((step, idx) => (
                              <div
                                key={idx}
                                className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${step.passed
                                  ? 'bg-emerald-50/50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-800'
                                  : 'bg-red-50/50 border-red-100 dark:bg-red-900/10 dark:border-red-800'
                                  }`}
                              >
                                <div className="flex-shrink-0 mt-0.5">
                                  {step.passed
                                    ? <CheckCircle2 size={14} className="text-emerald-500" />
                                    : <XCircle size={14} className="text-red-500" />
                                  }
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{step.step}</p>
                                  <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">{step.result}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Headed Mode Notice */}
                      <div className="mt-6 flex items-center gap-3 px-4 py-3 bg-blue-50/50 border border-blue-100 rounded-lg dark:bg-blue-900/10 dark:border-blue-800">
                        <Activity size={14} className="text-blue-500 animate-pulse" />
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest dark:text-blue-400">
                          Executed Live in Headed Browser
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ MARKDOWN PLAN VIEW ═══════════════ */}
      {!report && (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 shadow-lg min-h-[800px] relative overflow-hidden dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12 pointer-events-none">
            <FileText size={200} />
          </div>

          {!plan ? (
            <div className="flex flex-col items-center justify-center py-32 opacity-20">
              <RefreshCcw size={48} className="animate-spin mb-4" />
              <p className="font-black uppercase tracking-widest text-xs">Generating Plan...</p>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-slate-700 leading-relaxed text-sm overflow-x-hidden relative z-10 dark:text-slate-300">
              {plan}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

// ── Reusable Stat Card
const StatCard: React.FC<{ label: string; value: string | number; color: string }> = ({ label, value, color }) => {
  const colorMap: Record<string, string> = {
    blue: 'from-blue-500 to-blue-600 shadow-blue-200 dark:shadow-blue-900/30',
    emerald: 'from-emerald-500 to-emerald-600 shadow-emerald-200 dark:shadow-emerald-900/30',
    red: 'from-red-500 to-red-600 shadow-red-200 dark:shadow-red-900/30',
    orange: 'from-orange-500 to-orange-600 shadow-orange-200 dark:shadow-orange-900/30',
    purple: 'from-purple-500 to-purple-600 shadow-purple-200 dark:shadow-purple-900/30',
  };

  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} rounded-xl p-4 text-white shadow-lg`}>
      <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{label}</p>
      <p className="text-2xl font-black mt-1">{value}</p>
    </div>
  );
};
