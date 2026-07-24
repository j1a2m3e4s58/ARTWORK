import { useState } from 'react';
import { Sparkles, Loader2, TrendingUp, Lightbulb, RefreshCw } from 'lucide-react';
import { generateBusinessInsights } from '@/lib/aiHelpers';

export default function AIInsightsCard({ data }) {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateBusinessInsights(data);
      setInsights(result);
    } catch (e) {
      setError('Analysis failed. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="bg-gradient-to-br from-violet/20 to-carbon border border-brass/20 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-brass/15 flex items-center justify-center">
            <Sparkles className="text-brass" size={18} />
          </div>
          <div>
            <h2 className="font-display text-xl text-ivory">AI Business Insights</h2>
            <p className="text-ivory/40 text-xs font-tight">AI-powered analysis of your studio</p>
          </div>
        </div>
        {!insights && !loading && (
          <button onClick={handleAnalyze}
            className="flex items-center gap-2 bg-brass text-obsidian px-4 py-2 font-tight text-sm tracking-wide hover:bg-brass-light transition-all">
            <Sparkles size={13} /> Analyze
          </button>
        )}
        {insights && (
          <button onClick={handleAnalyze} disabled={loading}
            className="text-ivory/40 hover:text-brass text-xs font-tight flex items-center gap-1 disabled:opacity-30">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="text-brass/60 animate-spin" size={24} />
          <span className="text-ivory/40 text-sm ml-3 font-tight">Analyzing your studio data...</span>
        </div>
      )}

      {error && <p className="text-red-400/60 text-sm">{error}</p>}

      {insights && !loading && (
        <div className="space-y-4">
          <p className="text-ivory/70 text-sm leading-relaxed">{insights.summary}</p>
          <div className="space-y-2">
            {insights.insights?.map((ins, i) => (
              <div key={i} className="flex gap-3 items-start bg-obsidian/40 p-3 border border-brass/10">
                <TrendingUp size={14} className="text-brass/60 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-ivory/80 text-sm font-tight">{ins.title}</p>
                  <p className="text-ivory/50 text-xs leading-relaxed mt-0.5">{ins.detail}</p>
                </div>
              </div>
            ))}
          </div>
          {insights.opportunity && (
            <div className="flex gap-3 items-start bg-brass/5 p-4 border border-brass/20">
              <Lightbulb size={16} className="text-brass flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-brass/70 text-xs font-tight uppercase tracking-widest mb-1">Growth Opportunity</p>
                <p className="text-ivory/70 text-sm leading-relaxed">{insights.opportunity}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}