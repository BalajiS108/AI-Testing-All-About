import React from 'react';
import { Database, Search, ChevronRight, Info } from 'lucide-react';
import { Connection } from '../types';

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
  onFetch: () => void;
  onBack: () => void;
}

export const FetchIssues: React.FC<FetchIssuesProps> = ({ 
  activeConnection, 
  productName, setProductName, 
  projectKey, setProjectKey, 
  sprintVersion, setSprintVersion, 
  additionalContext, setAdditionalContext, 
  onFetch, onBack 
}) => {
  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-2xl font-bold text-slate-800">Fetch Jira Requirements</h2>
      </div>
      <p className="text-slate-500 mb-8 font-medium">Enter project details to fetch user stories and requirements.</p>

      <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="bg-white p-2 rounded-lg border border-blue-100 text-blue-600 shadow-sm flex-shrink-0">
            <Database size={18} />
          </div>
          <div className="truncate">
            <p className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-0.5">Connected to:</p>
            <p className="text-sm text-blue-600 truncate font-medium max-w-md">
              {activeConnection ? `${activeConnection.name} (${activeConnection.url})` : 'No connection found'}
            </p>
          </div>
        </div>
        <button onClick={onBack} className="text-blue-700 font-bold text-sm hover:underline px-4 py-2">Change</button>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="col-span-1">
          <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest">Product Name</label>
          <input 
            type="text" 
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="e.g., App.vwo.com"
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium"
          />
        </div>
        <div className="col-span-1">
          <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest">Project / Issue Key *</label>
          <input 
            type="text" 
            value={projectKey}
            onChange={(e) => setProjectKey(e.target.value)}
            placeholder="e.g., KAN or KAN-4"
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium border-rose-100"
          />
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest">Sprint/Fix Version (Optional)</label>
        <input 
          type="text" 
          value={sprintVersion}
          onChange={(e) => setSprintVersion(e.target.value)}
          placeholder="e.g., Sprint 15 or leave empty for all open issues"
          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium"
        />
      </div>

      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Additional Context (Optional)</label>
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
          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium resize-none"
        ></textarea>
      </div>

      <div className="pt-4 border-t border-slate-100">
         <button 
           onClick={() => onFetch()}
           className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 text-lg active:scale-[0.98]"
         >
            <Search size={20} />
            Fetch Jira Issues
         </button>
      </div>
    </div>
  );
};
