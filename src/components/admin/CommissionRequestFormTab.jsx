import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { studioClient } from '@/api/studioClient';

const DEFAULT_OPTIONS = {
  artworkTypes: ['Portrait', 'Digital Art', 'Sketch', 'Pencil Drawing', 'Anime Art', 'Realism', 'Other'],
  budgets: ['Under GH₵ 1,000', 'GH₵ 1,000–2,500', 'GH₵ 2,500–5,000', 'GH₵ 5,000–10,000', 'GH₵ 10,000+'],
  referenceUploadEnabled: true,
  referenceUploadLabel: 'Upload reference image (optional)',
};

function parseOptions(value) {
  try {
    const parsed = JSON.parse(value || '');
    if (!parsed || typeof parsed !== 'object') return DEFAULT_OPTIONS;
    return {
      artworkTypes: Array.isArray(parsed.artworkTypes) && parsed.artworkTypes.length ? parsed.artworkTypes : DEFAULT_OPTIONS.artworkTypes,
      budgets: Array.isArray(parsed.budgets) && parsed.budgets.length ? parsed.budgets : DEFAULT_OPTIONS.budgets,
      referenceUploadEnabled: parsed.referenceUploadEnabled !== false,
      referenceUploadLabel: String(parsed.referenceUploadLabel || DEFAULT_OPTIONS.referenceUploadLabel),
    };
  } catch { return DEFAULT_OPTIONS; }
}

export default function CommissionRequestFormTab() {
  const [record, setRecord] = useState(null);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    studioClient.entities.SiteContent.filter({ key: 'commission_form_options', page: 'Commission' })
      .then(items => {
        const existing = items.at(-1) || null;
        setRecord(existing);
        setOptions(parseOptions(existing?.value));
      })
      .catch(loadError => setError(loadError.message || 'Unable to load commission form settings.'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    const artworkTypes = options.artworkTypes.map(item => item.trim()).filter(Boolean);
    const budgets = options.budgets.map(item => item.trim()).filter(Boolean);
    if (!artworkTypes.length || !budgets.length) { setError('Keep at least one artwork type and one budget range.'); return; }
    setSaving(true); setError(''); setNotice('');
    const payload = { key: 'commission_form_options', label: 'Commission request form choices', page: 'Commission', group: 'Commission Request Form', value: JSON.stringify({ ...options, artworkTypes, budgets }) };
    try {
      const saved = record ? await studioClient.entities.SiteContent.update(record.id, payload) : await studioClient.entities.SiteContent.create(payload);
      setRecord(saved); setOptions(parseOptions(saved.value)); setNotice('Saved. The live commission form now uses these choices.');
      window.dispatchEvent(new Event('atelier:content-updated'));
    } catch (saveError) { setError(saveError.message || 'The commission form could not be saved.'); } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-24"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brass/20 border-t-brass" /></div>;
  return <div className="max-w-3xl">
    <h1 className="mb-2 font-display text-4xl text-ivory">Commission Request Form</h1>
    <p className="mb-7 text-sm text-ivory/45">Control every choice shown to customers. Put one option on each line; remove a line to remove it from the live form.</p>
    {error && <p role="alert" className="mb-5 border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
    {notice && <p role="status" className="mb-5 border border-green-400/30 bg-green-400/10 p-3 text-sm text-green-300">{notice}</p>}
    <div className="space-y-5 border border-brass/15 bg-carbon p-5">
      <label className="block text-xs uppercase tracking-wider text-ivory/45">Artwork types — one per line<textarea value={options.artworkTypes.join('\n')} onChange={event => setOptions(current => ({ ...current, artworkTypes: event.target.value.split('\n') }))} rows={8} className="mt-2 w-full resize-y border border-brass/15 bg-obsidian px-3 py-2.5 text-sm normal-case tracking-normal text-ivory" /></label>
      <label className="block text-xs uppercase tracking-wider text-ivory/45">Budget ranges — one per line<textarea value={options.budgets.join('\n')} onChange={event => setOptions(current => ({ ...current, budgets: event.target.value.split('\n') }))} rows={6} className="mt-2 w-full resize-y border border-brass/15 bg-obsidian px-3 py-2.5 text-sm normal-case tracking-normal text-ivory" /></label>
      <label className="block text-xs uppercase tracking-wider text-ivory/45">Reference-image upload label<input value={options.referenceUploadLabel} onChange={event => setOptions(current => ({ ...current, referenceUploadLabel: event.target.value }))} className="mt-2 w-full border border-brass/15 bg-obsidian px-3 py-2.5 text-sm normal-case tracking-normal text-ivory" /></label>
      <label className="flex items-center gap-3 text-sm text-ivory/70"><input type="checkbox" checked={options.referenceUploadEnabled} onChange={event => setOptions(current => ({ ...current, referenceUploadEnabled: event.target.checked }))} className="accent-brass" /> Let customers upload a reference image</label>
    </div>
    <button type="button" onClick={save} disabled={saving} className="mt-6 flex items-center gap-2 bg-brass px-5 py-3 text-sm text-obsidian disabled:opacity-50"><Save size={16} /> {saving ? 'Saving…' : 'Save form choices'}</button>
  </div>;
}
