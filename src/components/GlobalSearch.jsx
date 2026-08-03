import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { studioClient } from '@/api/studioClient';
import { imageVariant } from '@/lib/media';

const sources = [
  { entity: 'Artwork', label: 'Artwork', path: item => `/gallery?artwork=${item.id}`, image: item => item.imageUrl, text: item => `${item.title} ${item.category || ''} ${item.medium || ''} ${item.description || ''}` },
  { entity: 'ShopProduct', label: 'Art shop', path: () => '/shop', image: item => item.imageUrl, text: item => `${item.title} ${item.type || ''} ${item.description || ''}` },
  { entity: 'Video', label: 'Art film', path: () => '/videos', image: item => item.thumbnailUrl, text: item => `${item.title} ${item.category || ''} ${item.description || ''}` },
  { entity: 'Award', label: 'Honour', path: () => '/honours', image: item => item.imageUrl, text: item => `${item.title} ${item.year || ''} ${item.issuer || ''} ${item.description || ''}` },
  { entity: 'BlogPost', label: 'Journal', path: item => `/blog/${item.slug}`, image: item => item.imageUrl || item.coverImageUrl, text: item => `${item.title} ${item.excerpt || ''} ${item.content || ''}` },
];

export default function GlobalSearch({ open, onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    setLoading(true);
    Promise.all(sources.map(source => studioClient.entities[source.entity].list('-created_date', 100).then(records => records.map(record => ({ ...record, _source: source }))).catch(() => [])))
      .then(groups => setItems(groups.flat())).finally(() => setLoading(false));
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return items.filter(item => item._source.text(item).toLowerCase().includes(normalized)).slice(0, 24);
  }, [items, query]);
  const go = item => { navigate(item._source.path(item)); onClose(); setQuery(''); };

  return <AnimatePresence>{open && <motion.div className="fixed inset-0 z-[10000] overflow-y-auto bg-black/80 px-4 pt-[12vh] backdrop-blur-md sm:px-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><button className="absolute inset-0" aria-label="Close search" onClick={onClose} /><motion.section role="dialog" aria-modal="true" aria-label="Search Reigns Atelier" className="relative mx-auto w-full max-w-4xl" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}><div className="flex items-center border-b-2 border-brass bg-carbon px-4"><Search className="shrink-0 text-brass" size={27} /><input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search artworks, art films, shop items and journal…" className="h-20 min-w-0 flex-1 bg-transparent px-4 text-lg text-ivory outline-none placeholder:text-ivory/35 sm:text-2xl" /><button onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center text-ivory/55 hover:text-brass"><X size={23} /></button></div><div className="border border-t-0 border-brass/15 bg-carbon/95 shadow-2xl">{!query.trim() ? <p className="p-8 text-sm text-ivory/45">Start typing to search across the entire atelier.</p> : loading ? <p className="p-8 text-sm text-ivory/45">Searching the studio…</p> : results.length ? <div className="max-h-[58dvh] overflow-y-auto p-2">{results.map(item => { const thumbnail = item._source.image(item); return <button key={`${item._source.entity}-${item.id}`} onClick={() => go(item)} className="flex w-full items-center gap-4 p-3 text-left transition-colors hover:bg-brass/10"><div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden bg-obsidian text-[10px] uppercase text-ivory/35">{thumbnail ? <img src={imageVariant(thumbnail, 160)} alt="" className="h-full w-full object-cover" /> : item._source.label}</div><span className="min-w-0 flex-1"><span className="block truncate text-sm text-ivory">{item.title}</span><span className="mt-1 block text-[10px] uppercase tracking-widest text-brass/75">{item._source.label}</span></span></button>; })}</div> : <p className="p-8 text-sm text-ivory/45">No matching artworks, films, products, or journal entries.</p>}</div></motion.section></motion.div>}</AnimatePresence>;
}
