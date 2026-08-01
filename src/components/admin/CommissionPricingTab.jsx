import { useEffect, useMemo, useState } from 'react';
import { Copy, Plus, Save, Trash2 } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import FileUploadField from '@/components/admin/FileUploadField';
import { DEFAULT_COMMISSION_PRICES } from '@/lib/commissionPricing';

const blank = () => ({ id: `price-${Date.now()}`, category: 'New artwork category', size: 'A2', subjects: 'Single', finish: 'Unframed', price: 0, priceNote: '', previewImageUrl: '', active: true });

export default function CommissionPricingTab() {
  const [record, setRecord] = useState(null);
  const [items, setItems] = useState(DEFAULT_COMMISSION_PRICES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  useEffect(() => { studioClient.entities.SiteContent.filter({ key: 'commission_price_options', page: 'Commission' }, '-updated_date', 200).then(records => {
    // Keep the editor attached to the same newest record customers read.
    // This also safely handles legacy duplicate records from earlier saves.
    const existing = records[0] || null; setRecord(existing);
    if (existing?.value) { try { const parsed = JSON.parse(existing.value); if (Array.isArray(parsed) && parsed.length) setItems(parsed); } catch { /* defaults */ } }
  }).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  const update = (id, changes) => setItems(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
  const duplicate = item => setItems(current => [...current, { ...item, id: `price-${Date.now()}`, size: `${item.size} copy`, active: true }]);
  const active = useMemo(() => items.filter(item => item.active).length, [items]);
  const save = async () => {
    const clean = items.map(item => ({ ...item, category: String(item.category || '').trim(), size: String(item.size || '').trim(), subjects: String(item.subjects || '').trim(), finish: String(item.finish || '').trim(), price: Number(item.price || 0), priceNote: String(item.priceNote || '').trim() }));
    if (clean.some(item => !item.category || !item.size || !item.subjects || !item.finish || item.price < 0)) return setError('Every option needs a category, size, subject count, finish and a valid price.');
    setSaving(true); setError(''); setMessage('');
    const payload = { key: 'commission_price_options', label: 'Commission size, finish and price options', page: 'Commission', group: 'Commission Pricing', value: JSON.stringify(clean) };
    try { const saved = record ? await studioClient.entities.SiteContent.update(record.id, payload) : await studioClient.entities.SiteContent.create(payload); setRecord(saved); setItems(clean); setMessage('Saved. Customers now see these sizes, finishes, previews and prices.'); window.dispatchEvent(new Event('atelier:content-updated')); }
    catch (e) { setError(e.message || 'Could not save commission pricing.'); } finally { setSaving(false); }
  };
  if (loading) return <div className="flex justify-center py-24"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brass/20 border-t-brass" /></div>;
  return <div className="max-w-6xl"><h1 className="font-display text-3xl text-ivory sm:text-4xl">Commission sizes & prices</h1><p className="mt-2 max-w-3xl text-sm text-ivory/45">These are the customer-facing choices. Add, remove or rename any format, size, framed option and price. Add a preview photo to show that exact artwork choice.</p>
    {error && <p className="mt-5 border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}{message && <p className="mt-5 border border-green-400/30 bg-green-400/10 p-3 text-sm text-green-300">{message}</p>}
    <div className="mt-6 space-y-4">{items.map((item, i) => <article key={item.id} className="border border-brass/15 bg-carbon p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="text-xs uppercase tracking-[.2em] text-brass/70">Choice {i + 1}</p><div className="flex gap-2"><button type="button" onClick={() => update(item.id, { active: item.active === false })} className="border border-brass/20 px-3 py-1.5 text-xs text-ivory/60">{item.active === false ? 'Hidden' : 'Visible'}</button><button type="button" onClick={() => setItems(list => list.filter(candidate => candidate.id !== item.id))} className="border border-red-400/25 px-3 py-1.5 text-xs text-red-300"><Trash2 size={13}/></button></div></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[['Artwork category','category'],['Size / dimensions','size'],['Subjects','subjects'],['Finish','finish']].map(([label,key]) => <label key={key} className="text-xs uppercase tracking-wider text-ivory/45">{label}<input value={item[key] || ''} onChange={e => update(item.id, {[key]:e.target.value})} className="mt-2 w-full border border-brass/15 bg-obsidian px-3 py-2.5 text-sm normal-case tracking-normal text-ivory"/></label>)}<label className="text-xs uppercase tracking-wider text-ivory/45">Price (GHS)<input type="number" min="0" value={item.price ?? 0} onChange={e => update(item.id, {price:e.target.value})} className="mt-2 w-full border border-brass/15 bg-obsidian px-3 py-2.5 text-sm normal-case tracking-normal text-ivory"/></label></div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2"><label className="text-xs uppercase tracking-wider text-ivory/45">Price note (optional)<input value={item.priceNote || ''} onChange={e => update(item.id,{priceNote:e.target.value})} placeholder="For example: GHS 3,500–3,800" className="mt-2 w-full border border-brass/15 bg-obsidian px-3 py-2.5 text-sm normal-case tracking-normal text-ivory"/></label><FileUploadField label="Customer preview image (optional)" value={item.previewImageUrl} onChange={value => update(item.id,{previewImageUrl:value})} accept="image/*" placeholder="Upload a framed or paper preview image" /></div>
      <button type="button" onClick={() => duplicate(item)} className="mt-3 flex items-center gap-2 border border-brass/25 px-3 py-2 text-xs text-brass hover:bg-brass/10"><Copy size={13}/> Duplicate this option</button>
    </article>)}</div>
    <div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={() => setItems(list => [...list, blank()])} className="flex items-center gap-2 border border-brass/30 px-4 py-3 text-sm text-brass"><Plus size={16}/> Add size option</button><button type="button" disabled={saving || !active} onClick={save} className="flex items-center gap-2 bg-brass px-5 py-3 text-sm text-obsidian disabled:opacity-50"><Save size={16}/>{saving ? 'Saving…' : 'Save customer prices'}</button></div>
  </div>;
}
