import React, { useState } from 'react';
import { Database, Search, Info, FileType2, Globe, Figma, Upload, Loader2 } from 'lucide-react';
import { Connection, InputSourceType } from '../types';

interface FetchIssuesProps {
  activeConnection: Connection | null;
  productName: string;
  setProductName: (v: string) => void;
  projectKey: string;
  setProjectKey: (v: string) => void;
  sprintVersion: string;
  setSprintVersion: (v: string) => void;
  additionalContext: string;
  setAdditionalContext: (v: string) => void;
  inputSource: InputSourceType;
  setInputSource: (v: InputSourceType) => void;
  brdFile: File | null;
  setBrdFile: (f: File | null) => void;
  htmlUrl: string;
  setHtmlUrl: (v: string) => void;
  htmlBody: string;
  setHtmlBody: (v: string) => void;
  figmaUrl: string;
  setFigmaUrl: (v: string) => void;
  figmaToken: string;
  setFigmaToken: (v: string) => void;
  onFetch: () => void;
  onBack: () => void;
  isFetching?: boolean;
}

const SOURCES: { id: InputSourceType; label: string; icon: React.ComponentType<any>; hint: string }[] = [
  { id: 'jira', label: 'Jira', icon: Database, hint: 'Pull user stories/tasks from a Jira project' },
  { id: 'brd', label: 'BRD Document', icon: FileType2, hint: 'Upload a PDF / DOCX / MD requirements file' },
  { id: 'html', label: 'HTML Doc', icon: Globe, hint: 'Fetch a public URL or paste raw HTML' },
  { id: 'figma', label: 'Figma Design', icon: Figma, hint: 'Pull frames + text from a Figma file' },
];

export const FetchIssues: React.FC<FetchIssuesProps> = ({
  activeConnection,
  productName, setProductName,
  projectKey, setProjectKey,
  sprintVersion, setSprintVersion,
  additionalContext, setAdditionalContext,
  inputSource, setInputSource,
  brdFile, setBrdFile,
  htmlUrl, setHtmlUrl,
  htmlBody, setHtmlBody,
  figmaUrl, setFigmaUrl,
  figmaToken, setFigmaToken,
  onFetch, onBack,
  isFetching,
}) => {
  const [dragActive, setDragActive] = useState(false);

  const sourceMeta = SOURCES.find((s) => s.id === inputSource)!;
  const SourceIcon = sourceMeta.icon;

  const cta = (() => {
    switch (inputSource) {
      case 'jira': return 'Fetch Jira Issues';
      case 'brd': return 'Parse BRD Document';
      case 'html': return 'Parse HTML Content';
      case 'figma': return 'Fetch Figma Design';
    }
  })();

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setBrdFile(f);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Fetch Requirements</h2>
      </div>
      <p className="text-slate-500 mb-6 font-medium dark:text-slate-400">
        Choose where the requirements come from. The downstream test-plan generator works the same for every source.
      </p>

      {/* ── Source Tabs ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {SOURCES.map((s) => {
          const Icon = s.icon;
          const active = inputSource === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setInputSource(s.id)}
              className={`flex flex-col items-start gap-2 px-4 py-3 rounded-xl border text-left transition-all ${
                active
                  ? 'bg-blue-50 border-blue-300 shadow-sm dark:bg-blue-900/20 dark:border-blue-700'
                  : 'bg-white border-slate-200 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:hover:border-slate-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon size={16} className={active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'} />
                <span className={`text-sm font-bold ${active ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}`}>
                  {s.label}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{s.hint}</span>
            </button>
          );
        })}
      </div>

      {/* ── Jira-only: connection chip ────────────────────────── */}
      {inputSource === 'jira' && (
        <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 mb-6 flex items-center justify-between dark:bg-blue-900/10 dark:border-blue-800">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="bg-white p-2 rounded-lg border border-blue-100 text-blue-600 shadow-sm flex-shrink-0 dark:bg-slate-800 dark:border-blue-800">
              <Database size={18} />
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-0.5 dark:text-blue-300">Connected to:</p>
              <p className="text-sm text-blue-600 truncate font-medium max-w-md dark:text-blue-400">
                {activeConnection ? `${activeConnection.name} (${activeConnection.url})` : 'No connection found'}
              </p>
            </div>
          </div>
          <button onClick={onBack} className="text-blue-700 font-bold text-sm hover:underline px-4 py-2 dark:text-blue-300">Change</button>
        </div>
      )}

      {/* ── Universal: Product Name ───────────────────────────── */}
      <div className="mb-6">
        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest dark:text-slate-400">Product Name</label>
        <input
          type="text"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          placeholder="e.g., App.vwo.com"
          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
        />
      </div>

      {/* ── Source-specific form ──────────────────────────────── */}
      {inputSource === 'jira' && (
        <>
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest dark:text-slate-400">Project / Issue Key *</label>
              <input
                type="text"
                value={projectKey}
                onChange={(e) => setProjectKey(e.target.value)}
                placeholder="e.g., KAN or KAN-4"
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest dark:text-slate-400">Sprint / Fix Version (Optional)</label>
              <input
                type="text"
                value={sprintVersion}
                onChange={(e) => setSprintVersion(e.target.value)}
                placeholder="e.g., Sprint 15"
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              />
            </div>
          </div>
        </>
      )}

      {inputSource === 'brd' && (
        <div className="mb-6">
          <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest dark:text-slate-400">BRD Document (PDF, DOCX, MD, TXT)</label>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center gap-2 px-6 py-10 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
              dragActive
                ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-600'
                : 'border-slate-200 bg-white hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700'
            }`}
          >
            <Upload size={28} className="text-slate-400" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {brdFile ? brdFile.name : 'Drop file here or click to browse'}
            </p>
            {brdFile && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{(brdFile.size / 1024).toFixed(1)} KB</p>
            )}
            <input
              type="file"
              accept=".pdf,.docx,.md,.txt"
              className="hidden"
              onChange={(e) => setBrdFile(e.target.files?.[0] || null)}
            />
          </label>
          <p className="text-[11px] text-slate-400 mt-1.5">Max 25 MB. Each heading becomes a separate requirement item.</p>
        </div>
      )}

      {inputSource === 'html' && (
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest dark:text-slate-400">URL (public page)</label>
            <input
              type="text"
              value={htmlUrl}
              onChange={(e) => setHtmlUrl(e.target.value)}
              placeholder="https://docs.example.com/feature-spec"
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </div>
          <div className="text-xs text-slate-400 font-bold uppercase tracking-widest text-center">— or paste raw HTML —</div>
          <textarea
            rows={6}
            value={htmlBody}
            onChange={(e) => setHtmlBody(e.target.value)}
            placeholder="<html>...</html>"
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium resize-none font-mono text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          />
        </div>
      )}

      {inputSource === 'figma' && (
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest dark:text-slate-400">Figma File URL or Key</label>
            <input
              type="text"
              value={figmaUrl}
              onChange={(e) => setFigmaUrl(e.target.value)}
              placeholder="https://www.figma.com/design/abc123XYZ/MyFile"
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest dark:text-slate-400">Personal Access Token</label>
            <input
              type="password"
              value={figmaToken}
              onChange={(e) => setFigmaToken(e.target.value)}
              placeholder="figd_..."
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              Generate at figma.com → Settings → Personal access tokens (read access is enough).
            </p>
          </div>
        </div>
      )}

      {/* ── Additional Context (universal) ─────────────────────── */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest dark:text-slate-400">Additional Context (Optional)</label>
          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            <Info size={10} />
            Helps AI specialize the plan
          </div>
        </div>
        <textarea
          rows={4}
          value={additionalContext}
          onChange={(e) => setAdditionalContext(e.target.value)}
          placeholder="Any additional information about the product, testing goals, or constraints..."
          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium resize-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
        />
      </div>

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
        <button
          onClick={() => onFetch()}
          disabled={isFetching}
          className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 text-lg active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isFetching ? <Loader2 size={20} className="animate-spin" /> : <SourceIcon size={20} />}
          {isFetching ? 'Fetching...' : cta}
          {!isFetching && <Search size={16} className="opacity-70" />}
        </button>
      </div>
    </div>
  );
};
