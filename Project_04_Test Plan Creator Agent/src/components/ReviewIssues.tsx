import React from 'react';
import { RefreshCcw, FileText, CheckCircle2, ChevronRight, Info, Loader2 } from 'lucide-react';
import { Connection, JiraIssue } from '../types';

interface ReviewIssuesProps {
  activeConnection: Connection | null;
  issues: JiraIssue[];
  additionalContext: string;
  setAdditionalContext: (v: string) => void;
  outputType: 'plan' | 'cases';
  setOutputType: (v: 'plan' | 'cases') => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

export const ReviewIssues: React.FC<ReviewIssuesProps> = ({ 
  activeConnection, 
  issues, 
  additionalContext, 
  setAdditionalContext, 
  outputType,
  setOutputType,
  onGenerate, 
  isGenerating 
}) => {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      {/* Active Filter Summary */}

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="bg-white p-2 rounded-lg border border-slate-200 text-slate-600 shadow-sm flex-shrink-0">
             <RefreshCcw size={16} />
          </div>
          <p className="text-sm text-slate-600 truncate font-semibold">
            {activeConnection ? `${activeConnection.name} (${activeConnection.url})` : 'No connection'}
          </p>
        </div>
        <button className="flex items-center gap-2 text-slate-800 font-bold text-xs bg-white border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-all">
          <RefreshCcw size={14} />
          Refresh Issues
        </button>
      </div>

      {/* Additional Context & Notes */}
      <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-800">Additional Context & Notes</h3>
          <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-2 py-1 rounded">Refining Logic</span>
        </div>
        <p className="text-sm text-slate-500 mb-4 font-medium">Add any additional context, special requirements, or constraints for the final generation.</p>
        <textarea 
          rows={4}
          value={additionalContext}
          onChange={(e) => setAdditionalContext(e.target.value)}
          placeholder="Add any additional context about the testing approach, special requirements, constraints, team structure, or specific areas of focus..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium resize-none"
        ></textarea>
      </div>

      {/* Review Section */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Review Jira Issues ({issues.length})</h3>
              <p className="text-xs text-slate-500 font-medium">Issues that will be used to generate the test plan</p>
           </div>
           <div className="flex items-center gap-2">
              <span className="bg-slate-200 text-slate-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                {issues.length > 0 ? 'Ready to Process' : 'Empty List'}
              </span>
           </div>
        </div>
        
        <div className="p-0 max-h-[400px] overflow-y-auto">
          {issues.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {issues.map(issue => (
                <div key={issue.id} className="p-6 hover:bg-slate-50 transition-colors group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                         <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded tracking-widest border border-blue-100">{issue.key}</span>
                         <span className="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded tracking-widest border border-slate-200">{issue.status}</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-800 leading-tight truncate">{issue.summary}</h4>
                    </div>
                    <div className="bg-emerald-50 text-emerald-600 p-1.5 rounded-lg opacity-40 group-hover:opacity-100 transition-opacity">
                       <CheckCircle2 size={16} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-16 text-center">
                <div className="bg-slate-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-300 border-2 border-dashed border-slate-200">
                  <FileText size={24} />
                </div>
                <p className="text-slate-400 font-bold mb-1 uppercase tracking-widest text-[10px]">No issues selected</p>
                <p className="text-sm text-slate-400 max-w-xs mx-auto">Go back to fetch issues to populate this list.</p>
            </div>
          )}
        </div>

        <div className="p-8 bg-slate-50/50 border-t border-slate-100 dark:bg-slate-800/50 dark:border-slate-700">
           <div className="flex gap-4 mb-6">
              <button
                onClick={() => setOutputType('plan')}
                className={`flex-1 py-4 rounded-xl font-bold transition-all border-2 flex items-center justify-center gap-2 ${
                  outputType === 'plan' 
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' 
                    : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400'
                }`}
              >
                <FileText size={18} />
                Test Plan
              </button>
              <button
                onClick={() => setOutputType('cases')}
                className={`flex-1 py-4 rounded-xl font-bold transition-all border-2 flex items-center justify-center gap-2 ${
                  outputType === 'cases' 
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' 
                    : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400'
                }`}
              >
                <CheckCircle2 size={18} />
                Detailed Test Cases
              </button>
           </div>
           
           <button 
             onClick={onGenerate}
             disabled={isGenerating || issues.length === 0}
             className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-5 rounded-2xl font-black hover:shadow-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-3 text-lg active:scale-[0.98] disabled:opacity-50"
           >
              {isGenerating ? <Loader2 size={24} className="animate-spin" /> : <RefreshCcw size={24} />}
              {outputType === 'plan' ? 'Generate Standardized Plan' : 'Generate Test Cases'}
           </button>
        </div>
      </div>
    </div>
  );
};
