import { useEffect, useRef, useState } from 'react';
import { FileVideo, Image as ImageIcon, Loader2, Save, Trash2, Upload } from 'lucide-react';
import { studioClient } from '@/api/studioClient';

export default function MediaLibraryTab() {
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = () => studioClient.entities.Media.list('-created_date', 200).then(setItems).catch(loadError => setError(loadError.message));
  useEffect(() => { load(); }, []);

  const upload = async file => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await studioClient.integrations.Core.UploadFile({ file });
      await load();
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };
  const update = async item => {
    setBusy(true);
    try {
      await studioClient.entities.Media.update(item.id, { altText: item.altText || '', sourceName: item.sourceName || '' });
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async item => {
    if (!window.confirm(`Remove ${item.filename} from the media library? Existing published URLs are not deleted automatically.`)) return;
    await studioClient.entities.Media.delete(item.id);
    setItems(current => current.filter(candidate => candidate.id !== item.id));
  };
  return (
    <div>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><h1 className="font-display text-4xl text-ivory">Media Library</h1><p className="mt-2 text-sm text-ivory/40">Upload reusable media and record accessible descriptions and licensing sources.</p></div>
        <button onClick={() => inputRef.current?.click()} disabled={busy} className="flex min-h-11 items-center justify-center gap-2 bg-brass px-5 py-3 text-xs uppercase tracking-widest text-obsidian disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Upload media
        </button>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm" className="hidden" onChange={event => upload(event.target.files?.[0])} />
      </div>
      {error && <p role="alert" className="mb-5 border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-300">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.filter(item => item.purpose === 'content-library').map(item => (
          <article key={item.id} className="overflow-hidden border border-brass/10 bg-carbon">
            <div className="aspect-video bg-obsidian">
              {item.mime?.startsWith('image/') ? <img src={item.url} alt={item.altText || ''} className="h-full w-full object-cover" loading="lazy" /> : <video src={item.url} className="h-full w-full object-cover" controls preload="metadata" />}
            </div>
            <div className="space-y-3 p-4">
              <p className="flex items-center gap-2 truncate text-xs text-ivory/55">{item.mime?.startsWith('image/') ? <ImageIcon size={14} /> : <FileVideo size={14} />}{item.filename}</p>
              <input aria-label={`Alternative text for ${item.filename}`} value={item.altText || ''} onChange={event => setItems(current => current.map(candidate => candidate.id === item.id ? { ...candidate, altText: event.target.value } : candidate))} placeholder="Accessible image or video description" className="w-full border border-brass/15 bg-obsidian px-3 py-2 text-sm text-ivory/75" />
              <input aria-label={`Source for ${item.filename}`} value={item.sourceName || ''} onChange={event => setItems(current => current.map(candidate => candidate.id === item.id ? { ...candidate, sourceName: event.target.value } : candidate))} placeholder="Original / licence / photographer" className="w-full border border-brass/15 bg-obsidian px-3 py-2 text-sm text-ivory/75" />
              <div className="flex gap-2"><button onClick={() => update(item)} className="flex min-h-11 flex-1 items-center justify-center gap-2 border border-brass/25 text-xs text-brass"><Save size={14} /> Save metadata</button><button onClick={() => remove(item)} aria-label={`Remove ${item.filename}`} className="flex h-11 w-11 items-center justify-center border border-red-400/20 text-red-300"><Trash2 size={14} /></button></div>
            </div>
          </article>
        ))}
      </div>
      {!items.filter(item => item.purpose === 'content-library').length && !busy && <p className="py-20 text-center text-sm text-ivory/35">No reusable studio media has been uploaded yet.</p>}
    </div>
  );
}
