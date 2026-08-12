import { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Loader2, RotateCcw, Square, Trash2 } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import { useAuth } from '@/lib/AuthContext';
import GlassConfirmDialog from '@/components/GlassConfirmDialog';

const entities = ['Artwork', 'HeroSlide', 'Media', 'ShopProduct', 'Testimonial', 'Video', 'BlogPost'];
const itemKey = item => `${item.entity}:${item.id}`;

export default function RecycleBinTab() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const [error, setError] = useState('');
  const [pendingPurge, setPendingPurge] = useState([]);
  const canPurge = user?.role === 'admin';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const groups = await Promise.all(entities.map(entity =>
        studioClient.entities[entity].filter({ includeDeleted: true }, '-created_date', 200)
          .then(records => records.filter(record => record.deleted_at).map(record => ({ ...record, entity })))
      ));
      setItems(groups.flat().sort((a, b) => String(b.deleted_at).localeCompare(String(a.deleted_at))));
      setSelected(new Set());
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  const allSelected = useMemo(() => items.length > 0 && items.every(item => selected.has(itemKey(item))), [items, selected]);

  const toggle = item => setSelected(current => {
    const next = new Set(current);
    const key = itemKey(item);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map(itemKey)));

  const restore = async item => {
    try {
      await studioClient.entities[item.entity].restore(item.id);
      setItems(current => current.filter(candidate => itemKey(candidate) !== itemKey(item)));
      setSelected(current => {
        const next = new Set(current);
        next.delete(itemKey(item));
        return next;
      });
    } catch (restoreError) { setError(restoreError.message); }
  };

  const purgeItems = async targets => {
    if (!targets.length) return;
    setPurging(true);
    setError('');
    try {
      await studioClient.admin.purgeRecycleBin(targets.map(item => ({ entity: item.entity, id: item.id })));
      const removed = new Set(targets.map(itemKey));
      setItems(current => current.filter(item => !removed.has(itemKey(item))));
      setSelected(current => new Set([...current].filter(key => !removed.has(key))));
      setPendingPurge([]);
    } catch (purgeError) { setError(purgeError.message); } finally { setPurging(false); }
  };

  const selectedItems = items.filter(item => selected.has(itemKey(item)));
  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="flex items-center gap-3 font-display text-4xl text-ivory"><Trash2 className="text-brass" /> Recycle Bin</h1><p className="mt-2 max-w-2xl text-sm text-ivory/40">Restore removed content, or permanently clear files and records you no longer need.</p></div>
        {canPurge && items.length > 0 && <div className="flex flex-wrap gap-2">
          <button onClick={toggleAll} className="min-h-10 border border-brass/25 px-3 text-xs text-ivory/65 hover:border-brass/50">{allSelected ? 'Clear selection' : 'Select all'}</button>
          <button disabled={!selectedItems.length || purging} onClick={() => setPendingPurge(selectedItems)} className="min-h-10 border border-red-400/30 px-3 text-xs text-red-300 disabled:cursor-not-allowed disabled:opacity-40">Delete selected ({selectedItems.length})</button>
          <button disabled={purging} onClick={() => setPendingPurge(items)} className="min-h-10 bg-red-500/15 px-3 text-xs text-red-200 hover:bg-red-500/25 disabled:opacity-40">Delete all</button>
        </div>}
      </div>
      {error && <p role="alert" className="mb-4 border border-red-400/20 p-3 text-sm text-red-300">{error}</p>}
      {loading ? <Loader2 className="mx-auto animate-spin text-brass" /> : (
        <div className="space-y-2">
          {items.map(item => {
            const checked = selected.has(itemKey(item));
            return <div key={itemKey(item)} className="flex flex-col gap-3 border border-brass/10 bg-carbon p-4 sm:flex-row sm:items-center">
              {canPurge && <button onClick={() => toggle(item)} aria-label={`Select ${item.title || item.filename || 'record'}`} className="shrink-0 text-brass">{checked ? <CheckSquare size={20} /> : <Square size={20} />}</button>}
              <div className="min-w-0 flex-1"><p className="truncate text-sm text-ivory/75">{item.title || item.filename || item.clientName || item.key || 'Untitled record'}</p><p className="mt-1 text-[10px] uppercase tracking-widest text-ivory/30">{item.entity} · removed {new Date(item.deleted_at).toLocaleString()}</p></div>
              <div className="flex gap-2"><button onClick={() => restore(item)} className="flex min-h-10 flex-1 items-center justify-center gap-2 border border-brass/25 px-3 text-xs text-brass sm:flex-none"><RotateCcw size={14} /> Restore</button>
                {canPurge && <button disabled={purging} onClick={() => setPendingPurge([item])} className="min-h-10 border border-red-400/25 px-3 text-xs text-red-300 disabled:opacity-40">Delete</button>}
              </div>
            </div>;
          })}
          {!items.length && <p className="py-20 text-center text-sm text-ivory/35">The recycle bin is empty.</p>}
        </div>
      )}
      <GlassConfirmDialog
        open={pendingPurge.length > 0}
        onOpenChange={open => !open && setPendingPurge([])}
        onConfirm={() => purgeItems(pendingPurge)}
        busy={purging}
        title={pendingPurge.length === items.length ? 'Empty the recycle bin?' : `Delete ${pendingPurge.length} item${pendingPurge.length === 1 ? '' : 's'}?`}
        description={`This will permanently delete ${pendingPurge.length === items.length ? 'everything in the recycle bin' : `the selected item${pendingPurge.length === 1 ? '' : 's'}`}. This cannot be undone.`}
      />
    </div>
  );
}
