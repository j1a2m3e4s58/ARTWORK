import { useState } from 'react';
import { Wand2, Loader2, Check } from 'lucide-react';
import { autoSuggestArtwork } from '@/lib/aiHelpers';

export default function ArtworkAutoSuggest({ imageUrl, onApply }) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [applied, setApplied] = useState(false);

  const handleAnalyze = async () => {
    if (!imageUrl) return;
    setLoading(true);
    setApplied(false);
    try {
      const res = await autoSuggestArtwork(imageUrl);
      setSuggestion(res);
    } catch (e) {
      setSuggestion({ error: 'Analysis failed. Try again.' });
    }
    setLoading(false);
  };

  const handleApply = () => {
    onApply({
      title: suggestion.title,
      description: suggestion.description,
      category: suggestion.category,
      medium: suggestion.medium,
      price: String(suggestion.price_suggestion),
      tags: suggestion.tags,
      span: suggestion.span,
    });
    setApplied(true);
  };

  if (!imageUrl) return null;

  return (
    <div className="border border-brass/20 p-4 bg-violet/5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wand2 size={14} className="text-brass" />
          <span className="font-tight text-xs uppercase tracking-widest text-brass/70">AI Auto-Suggest</span>
        </div>
        {!suggestion && (
          <button onClick={handleAnalyze} disabled={loading}
            className="flex items-center gap-1.5 bg-brass text-obsidian px-3 py-1.5 font-tight text-xs tracking-wide hover:bg-brass-light transition-all disabled:opacity-30">
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} {loading ? 'Analyzing...' : 'Analyze Image'}
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-ivory/40 text-sm">
          <Loader2 size={14} className="animate-spin" /> AI is studying your artwork...
        </div>
      )}

      {suggestion && !suggestion.error && !applied && (
        <div className="space-y-3">
          <div>
            <p className="text-ivory/25 text-[10px] uppercase tracking-widest mb-1">Title</p>
            <p className="text-ivory/80 text-sm">{suggestion.title}</p>
          </div>
          <div>
            <p className="text-ivory/25 text-[10px] uppercase tracking-widest mb-1">Description</p>
            <p className="text-ivory/60 text-sm leading-relaxed">{suggestion.description}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div><span className="text-ivory/25 block">Category</span><span className="text-ivory/70">{suggestion.category}</span></div>
            <div><span className="text-ivory/25 block">Medium</span><span className="text-ivory/70">{suggestion.medium}</span></div>
            <div><span className="text-ivory/25 block">Suggested Price</span><span className="text-brass">${suggestion.price_suggestion}</span></div>
          </div>
          {suggestion.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suggestion.tags.map(t => <span key={t} className="text-xs text-brass/50 border border-brass/15 px-2 py-0.5">{t}</span>)}
            </div>
          )}
          <button onClick={handleApply}
            className="w-full flex items-center justify-center gap-2 bg-brass text-obsidian py-2.5 font-tight text-xs tracking-widest uppercase hover:bg-brass-light transition-all">
            <Check size={13} /> Apply Suggestions
          </button>
        </div>
      )}

      {suggestion?.error && <p className="text-red-400/60 text-xs">{suggestion.error}</p>}

      {applied && (
        <div className="flex items-center gap-2 text-green-400/70 text-sm">
          <Check size={14} /> Suggestions applied to form!
        </div>
      )}
    </div>
  );
}