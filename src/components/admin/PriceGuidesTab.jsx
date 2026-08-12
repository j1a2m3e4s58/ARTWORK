import { useEffect, useState } from 'react';
import { FileText, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import FileUploadField from './FileUploadField';
import ResponsiveSelect from '@/components/ResponsiveSelect';
import useGlassConfirm from '@/hooks/useGlassConfirm';

const emptyGuide = { title: '', description: '', fileUrl: '', status: 'published', sortOrder: 0 };

export default function PriceGuidesTab() {
  const { confirm, confirmDialog } = useGlassConfirm();
  const [guides, setGuides] = useState([]);
  const [form, setForm] = useState(emptyGuide);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try { setGuides(await studioClient.entities.PriceGuide.list('sortOrder', 100)); }
    catch (loadError) { setError(loadError.message); }
  };
  useEffect(() => { load(); }, []);

  const reset = () => { setForm(emptyGuide); setEditingId(null); };
  const save = async event => {
    event.preventDefault();
    if (!form.title.trim() || !form.fileUrl.trim()) return setError('Give this price guide a title and PDF file.');
    setBusy(true); setError('');
    try {
      const payload = { ...form, title: form.title.trim(), description: form.description.trim(), sortOrder: Number(form.sortOrder) || 0 };
      if (editingId) await studioClient.entities.PriceGuide.update(editingId, payload);
      else await studioClient.entities.PriceGuide.create(payload);
      reset(); await load();
    } catch (saveError) { setError(saveError.message); }
    finally { setBusy(false); }
  };
  const edit = guide => { setEditingId(guide.id); setForm({ ...emptyGuide, ...guide }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const remove = async guide => {
    if (!await confirm({ title: 'Remove this price guide?', description: `“${guide.title}” will disappear from customer price guides. Its PDF remains in Media Library until permanently purged.`, confirmLabel: 'Remove guide' })) return;
    try { await studioClient.entities.PriceGuide.delete(guide.id); await load(); }
    catch (removeError) { setError(removeError.message); }
  };

  return <div className="mx-auto max-w-5xl">{confirmDialog}
    <header className="mb-7"><p className="text-xs uppercase tracking-[.28em] text-brass">Art shop</p><h1 className="mt-2 font-display text-4xl text-ivory">Customer price guides</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-ivory/45">Publish downloadable PDF price lists for customers. You can upload a replacement, keep a guide as a draft, reorder it, or remove it at any time.</p></header>
    <form onSubmit={save} className="border border-brass/15 bg-carbon p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-display text-2xl text-ivory"><FileText className="text-brass" size={20} />{editingId ? 'Edit price guide' : 'Add price guide'}</h2>{editingId && <button type="button" onClick={reset} className="text-xs text-brass hover:underline">Cancel edit</button>}</div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs uppercase tracking-wider text-ivory/45">Title<input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} className="mt-2 min-h-11 w-full border border-brass/20 bg-obsidian px-3 text-sm text-ivory" placeholder="e.g. Portrait price list" /></label><label className="text-xs uppercase tracking-wider text-ivory/45">Display order<input type="number" min="0" value={form.sortOrder} onChange={event => setForm(current => ({ ...current, sortOrder: event.target.value }))} className="mt-2 min-h-11 w-full border border-brass/20 bg-obsidian px-3 text-sm text-ivory" /></label></div>
      <div className="mt-4"><FileUploadField label="PDF price guide" value={form.fileUrl} onChange={fileUrl => setForm(current => ({ ...current, fileUrl }))} accept="application/pdf" placeholder="Paste a PDF URL or upload a price-list PDF" /></div>
      <label className="mt-4 block text-xs uppercase tracking-wider text-ivory/45">Short description<textarea value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} rows={3} className="mt-2 w-full border border-brass/20 bg-obsidian p-3 text-sm text-ivory" placeholder="Tell customers what is included in this guide." /></label>
      <div className="mt-4 max-w-xs"><ResponsiveSelect label="Publishing status" value={form.status} onChange={status => setForm(current => ({ ...current, status }))} options={[{ value: 'published', label: 'Published — visible in Art Shop' }, { value: 'draft', label: 'Draft — hidden from customers' }]} /></div>
      {error && <p role="alert" className="mt-4 border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p>}
      <button disabled={busy} className="mt-5 flex min-h-11 items-center justify-center gap-2 bg-brass px-5 text-xs uppercase tracking-widest text-obsidian disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}{editingId ? 'Save price guide' : 'Add price guide'}</button>
    </form>
    <div className="mt-7 space-y-3">{guides.map(guide => <article key={guide.id} className="flex flex-col gap-4 border border-brass/10 bg-carbon p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><FileText size={18} className="shrink-0 text-brass" /><h2 className="truncate font-display text-xl text-ivory">{guide.title}</h2><span className={`shrink-0 px-2 py-1 text-[10px] uppercase tracking-wider ${guide.status === 'published' ? 'bg-green-400/10 text-green-300' : 'bg-ivory/10 text-ivory/50'}`}>{guide.status || 'draft'}</span></div><p className="mt-2 text-sm text-ivory/45">{guide.description || 'No description added.'}</p><a href={guide.fileUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-brass hover:underline">Open PDF</a></div><div className="flex shrink-0 gap-2"><button onClick={() => edit(guide)} className="flex min-h-10 items-center gap-2 border border-brass/25 px-3 text-xs text-brass"><Pencil size={14} /> Edit</button><button onClick={() => remove(guide)} aria-label={`Remove ${guide.title}`} className="flex h-10 w-10 items-center justify-center border border-red-400/20 text-red-300"><Trash2 size={15} /></button></div></article>)}{!guides.length && <p className="py-12 text-center text-sm text-ivory/40">No price guides have been added yet.</p>}</div>
  </div>;
}
