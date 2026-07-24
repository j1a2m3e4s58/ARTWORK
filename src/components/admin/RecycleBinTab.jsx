import { useEffect, useState } from 'react';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import { useAuth } from '@/lib/AuthContext';

const entities = ['Artwork', 'HeroSlide', 'Media', 'ShopProduct', 'Testimonial', 'Video', 'BlogPost'];

export default function RecycleBinTab() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const groups = await Promise.all(entities.map(entity =>
        studioClient.entities[entity].filter({ includeDeleted: true }, '-created_date', 200)
          .then(records => records.filter(record => record.deleted_at).map(record => ({ ...record, entity })))
      ));
      setItems(groups.flat().sort((a, b) => String(b.deleted_at).localeCompare(String(a.deleted_at))));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  const restore = async item => {
    await studioClient.entities[item.entity].restore(item.id);
    setItems(current => current.filter(candidate => !(candidate.entity === item.entity && candidate.id === item.id)));
  };
  const purge = async item => {
    if (!window.confirm(`Permanently delete ${item.filename || 'this media file'}? This cannot be undone.`)) return;
    await studioClient.admin.purgeMedia(item.id);
    setItems(current => current.filter(candidate => !(candidate.entity === item.entity && candidate.id === item.id)));
  };
  return (
    <div>
      <div className="mb-8"><h1 className="flex items-center gap-3 font-display text-4xl text-ivory"><Trash2 className="text-brass" /> Recycle Bin</h1><p className="mt-2 text-sm text-ivory/40">Restore content removed from the public site. Stored media files are retained until an administrator permanently purges them.</p></div>
      {error && <p role="alert" className="mb-4 border border-red-400/20 p-3 text-sm text-red-300">{error}</p>}
      {loading ? <Loader2 className="mx-auto animate-spin text-brass" /> : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={`${item.entity}-${item.id}`} className="flex flex-col gap-3 border border-brass/10 bg-carbon p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1"><p className="truncate text-sm text-ivory/75">{item.title || item.filename || item.clientName || item.key || 'Untitled record'}</p><p className="mt-1 text-[10px] uppercase tracking-widest text-ivory/30">{item.entity} · removed {new Date(item.deleted_at).toLocaleString()}</p></div>
              <div className="flex gap-2"><button onClick={() => restore(item)} className="flex min-h-11 items-center justify-center gap-2 border border-brass/25 px-4 text-xs text-brass"><RotateCcw size={14} /> Restore</button>
                {item.entity === 'Media' && user?.role === 'admin' && <button onClick={() => purge(item)} className="min-h-11 border border-red-400/25 px-3 text-xs text-red-300">Purge</button>}
              </div>
            </div>
          ))}
          {!items.length && <p className="py-20 text-center text-sm text-ivory/35">The recycle bin is empty.</p>}
        </div>
      )}
    </div>
  );
}
