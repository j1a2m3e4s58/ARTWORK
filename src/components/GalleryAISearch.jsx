import { useState } from 'react';
import { Sparkles, Loader2, Search, X } from 'lucide-react';
import { semanticSearch } from '@/lib/aiHelpers';

export default function GalleryAISearch({ artworks, onResults, activeCategory }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setActive(true);
    try {
      const ids = await semanticSearch(query, artworks);
      const results = ids.map(id => artworks.find(a => a.id === id)).filter(Boolean);
      onResults(results);
    } catch (e) {
      onResults([]);
    }
    setLoading(false);
  };

  const handleClear = () => {
    setQuery('');
    setActive(false);
    onResults(null);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Sparkles size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${active ? 'text-brass' : 'text-ivory/30'}`} />
        <input
          type="text"
          placeholder="Search by mood, color, feeling..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          className="bg-carbon border border-brass/20 text-ivory/80 pl-10 pr-10 py-2.5 text-sm placeholder:text-ivory/25 focus:outline-none focus:border-brass/40 transition-colors w-full"
        />
        {query && (
          <button onClick={handleClear} className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory/30 hover:text-brass">
            <X size={14} />
          </button>
        )}
      </div>
      <button onClick={handleSearch} disabled={!query.trim() || loading}
        className="flex items-center gap-1.5 bg-brass/10 border border-brass/30 text-brass px-4 py-2.5 font-tight text-xs tracking-wide hover:bg-brass/20 transition-all disabled:opacity-30 whitespace-nowrap">
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} AI Search
      </button>
    </div>
  );
}