import { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Star, Trash2 } from 'lucide-react';
import { studioClient } from '@/api/studioClient';

const DEFAULT_PACKAGES = [
  { id: 'sketch-study', name: 'Sketch Study', price: 'GH₵ 800', duration: '5–7 days', features: ['One subject', 'Pencil / Charcoal', 'Digital delivery', '1 revision', 'A4 size'], featured: false, active: true },
  { id: 'fine-portrait', name: 'Fine Portrait', price: 'GH₵ 2,000', duration: '10–14 days', features: ['One subject', 'Choice of medium', 'High-res digital + print', '3 revisions', 'A3 size', 'Certificate of authenticity'], featured: true, active: true },
  { id: 'masterwork', name: 'Masterwork', price: 'GH₵ 4,500+', duration: '3–5 weeks', features: ['Multiple subjects', 'Premium medium', 'Original shipped worldwide', 'Unlimited revisions', 'Custom size', 'Certificate + framing'], featured: false, active: true },
];

const createPackage = () => ({
  id: `package-${Date.now()}`,
  name: 'New commission package',
  price: 'GH₵ ',
  duration: 'Estimated timeframe',
  features: ['Describe what is included'],
  featured: false,
  active: true,
});

const parsePackages = value => {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.length) return parsed.map((item, index) => ({
      id: item.id || `package-${index}`,
      name: String(item.name || 'Untitled package').slice(0, 120),
      price: String(item.price || '').slice(0, 80),
      duration: String(item.duration || '').slice(0, 100),
      features: Array.isArray(item.features) ? item.features.map(feature => String(feature).trim()).filter(Boolean).slice(0, 20) : [],
      featured: Boolean(item.featured),
      active: item.active !== false,
    }));
  } catch { /* Use the original packages until an admin saves a new set. */ }
  return DEFAULT_PACKAGES;
};

export default function CommissionPackagesTab() {
  const [record, setRecord] = useState(null);
  const [packages, setPackages] = useState(DEFAULT_PACKAGES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    studioClient.entities.SiteContent.filter({ key: 'commission_packages', page: 'Commission' })
      .then(records => {
        const existing = records[0] || null;
        setRecord(existing);
        setPackages(parsePackages(existing?.value));
      })
      .catch(loadError => setError(loadError.message || 'Unable to load commission packages.'))
      .finally(() => setLoading(false));
  }, []);

  const activeCount = useMemo(() => packages.filter(item => item.active).length, [packages]);

  const updatePackage = (id, changes) => {
    setMessage('');
    setPackages(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
  };

  const setFeatured = id => {
    setMessage('');
    setPackages(current => current.map(item => ({ ...item, featured: item.id === id })));
  };

  const save = async () => {
    const clean = packages.map(item => ({
      ...item,
      name: item.name.trim(),
      price: item.price.trim(),
      duration: item.duration.trim(),
      features: item.features.map(feature => feature.trim()).filter(Boolean),
    }));
    if (clean.some(item => !item.name || !item.price || !item.duration)) {
      setError('Every package needs a name, price, and timeframe.');
      return;
    }
    if (!clean.some(item => item.active)) {
      setError('Keep at least one package visible on the commission page.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        key: 'commission_packages',
        label: 'Commission packages and offers',
        value: JSON.stringify(clean),
        page: 'Commission',
        group: 'Commission Packages',
      };
      const saved = record
        ? await studioClient.entities.SiteContent.update(record.id, payload)
        : await studioClient.entities.SiteContent.create(payload);
      setRecord(saved);
      setPackages(clean);
      setMessage('Saved. The commission page now uses these packages.');
      window.dispatchEvent(new Event('atelier:content-updated'));
    } catch (saveError) {
      setError(saveError.message || 'The packages could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-24"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brass/20 border-t-brass" /></div>;

  return (
    <div>
      <h1 className="mb-2 font-display text-4xl text-ivory">Commission Packages</h1>
      <p className="mb-7 max-w-2xl text-sm text-ivory/45">Change prices, package text, turnaround time, included offers, visibility, and the “Most Popular” label. Add as many packages as you need.</p>
      {error && <p role="alert" className="mb-5 border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
      {message && <p role="status" className="mb-5 border border-green-400/30 bg-green-400/10 p-3 text-sm text-green-300">{message}</p>}

      <div className="space-y-5">
        {packages.map((item, index) => (
          <article key={item.id} className="border border-brass/15 bg-carbon p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-brass/10 pb-4">
              <p className="font-tight text-xs uppercase tracking-[0.22em] text-brass/70">Package {index + 1}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => updatePackage(item.id, { active: !item.active })} className={`border px-3 py-1.5 text-xs ${item.active ? 'border-green-400/35 text-green-300' : 'border-ivory/15 text-ivory/45'}`}>{item.active ? 'Visible' : 'Hidden'}</button>
                <button type="button" onClick={() => setFeatured(item.id)} className={`flex items-center gap-1 border px-3 py-1.5 text-xs ${item.featured ? 'border-brass bg-brass/10 text-brass' : 'border-brass/20 text-ivory/50'}`}><Star size={13} fill={item.featured ? 'currentColor' : 'none'} /> Most popular</button>
                <button type="button" disabled={packages.length === 1} onClick={() => setPackages(current => current.filter(candidate => candidate.id !== item.id))} className="flex items-center gap-1 border border-red-400/20 px-3 py-1.5 text-xs text-red-300 disabled:opacity-35"><Trash2 size={13} /> Remove</button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-xs uppercase tracking-wider text-ivory/45">Package name<input value={item.name} onChange={event => updatePackage(item.id, { name: event.target.value })} className="mt-2 w-full border border-brass/15 bg-obsidian px-3 py-2.5 text-sm normal-case tracking-normal text-ivory" /></label>
              <label className="text-xs uppercase tracking-wider text-ivory/45">Price<input value={item.price} onChange={event => updatePackage(item.id, { price: event.target.value })} className="mt-2 w-full border border-brass/15 bg-obsidian px-3 py-2.5 text-sm normal-case tracking-normal text-ivory" /></label>
              <label className="text-xs uppercase tracking-wider text-ivory/45">Timeframe<input value={item.duration} onChange={event => updatePackage(item.id, { duration: event.target.value })} className="mt-2 w-full border border-brass/15 bg-obsidian px-3 py-2.5 text-sm normal-case tracking-normal text-ivory" /></label>
            </div>
            <label className="mt-4 block text-xs uppercase tracking-wider text-ivory/45">Included offers — one per line<textarea value={item.features.join('\n')} onChange={event => updatePackage(item.id, { features: event.target.value.split('\n') })} rows={6} className="mt-2 w-full resize-y border border-brass/15 bg-obsidian px-3 py-2.5 text-sm normal-case tracking-normal text-ivory" /></label>
          </article>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={() => { setPackages(current => [...current, createPackage()]); setMessage(''); }} className="flex min-h-10 shrink-0 items-center gap-2 border border-brass/30 px-3 py-2 text-xs text-brass hover:bg-brass/10 sm:px-4 sm:py-3 sm:text-sm"><Plus size={16} /> <span className="hidden min-[390px]:inline">Add package</span><span className="min-[390px]:hidden">Add</span></button>
        <button type="button" disabled={saving || activeCount === 0} onClick={save} className="flex items-center gap-2 bg-brass px-5 py-3 text-sm text-obsidian disabled:opacity-50"><Save size={16} /> {saving ? 'Saving…' : 'Save package changes'}</button>
      </div>
    </div>
  );
}
