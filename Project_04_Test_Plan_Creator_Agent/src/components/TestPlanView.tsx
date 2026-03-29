import React from 'react';
import { FileText, Download, Share2, Clipboard, Printer, RefreshCcw } from 'lucide-react';

interface TestPlanViewProps {
  plan: string;
  productName: string;
}

export const TestPlanView: React.FC<TestPlanViewProps> = ({ plan, productName }) => {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(plan);
    alert("Copied to clipboard!");
  };

  const downloadMarkdown = () => {
    const element = document.createElement("a");
    const file = new Blob([plan], {type: 'text/markdown'});
    element.href = URL.createObjectURL(file);
    element.download = `${productName}_TestPlan.md`;
    document.body.appendChild(element);
    element.click();
  };

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Standardized Test Plan</h2>
          <p className="text-slate-500 font-medium tracking-wide">Product: {productName || 'Default Project'}</p>
        </div>
        <div className="flex gap-3">
           <button 
             onClick={copyToClipboard}
             className="flex items-center gap-2 px-6 py-3 border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all text-slate-600 active:scale-95"
           >
             <Clipboard size={18} />
             Copy Markdown
           </button>
           <button 
             onClick={downloadMarkdown}
             className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-95"
           >
             <Download size={18} />
             Download MD
           </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-16 shadow-lg min-h-[800px] relative overflow-hidden">
         {/* Paper Watermark Effect */}
         <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12 pointer-events-none">
            <FileText size={200} />
         </div>

         {!plan ? (
            <div className="flex flex-col items-center justify-center py-32 opacity-20">
               <RefreshCcw size={48} className="animate-spin mb-4" />
               <p className="font-black uppercase tracking-widest text-xs">Generating Plan...</p>
            </div>
         ) : (
            <pre className="whitespace-pre-wrap font-sans text-slate-700 leading-relaxed text-sm overflow-x-hidden relative z-10">
              {plan}
            </pre>
         )}
      </div>
    </div>
  );
};

// No custom RefreshCcw needed anymore as we import from lucide
