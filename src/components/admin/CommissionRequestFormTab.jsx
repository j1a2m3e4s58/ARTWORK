import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import {
  DEFAULT_COMMISSION_OPTIONS,
  normalizeCommissionOptions,
  parseCommissionOptions,
} from '@/lib/commissionOptions';
import {
  DEFAULT_STUDIO_OPTIONS,
  normalizeStudioOptions,
  parseStudioOptions,
} from '@/lib/studioOptions';

const newestRecord = records => [...(records || [])].sort((a, b) => (
  new Date(a.updated_date || a.created_date || 0) - new Date(b.updated_date || b.created_date || 0)
)).at(-1) || null;

const lines = value => value.split('\n');

function ManagedList({ label, hint, value, onChange, rows = 7 }) {
  return (
    <label className="block text-xs uppercase tracking-wider text-ivory/45">
      {label}
      <span className="mt-1 block text-[11px] normal-case tracking-normal text-ivory/30">{hint}</span>
      <textarea
        value={value.join('\n')}
        onChange={event => onChange(lines(event.target.value))}
        rows={rows}
        className="mt-2 w-full resize-y border border-brass/15 bg-obsidian px-3 py-2.5 text-sm normal-case tracking-normal text-ivory"
      />
      <span className="mt-1 block text-[11px] normal-case tracking-normal text-brass/65">
        {value.map(item => item.trim()).filter(Boolean).length} choices
      </span>
    </label>
  );
}

export default function CommissionRequestFormTab({ onStudioOptionsSaved }) {
  const [commissionRecord, setCommissionRecord] = useState(null);
  const [studioRecord, setStudioRecord] = useState(null);
  const [options, setOptions] = useState(DEFAULT_COMMISSION_OPTIONS);
  const [studioOptions, setStudioOptions] = useState(DEFAULT_STUDIO_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      studioClient.entities.SiteContent.filter({ key: 'commission_form_options', page: 'Commission' }),
      studioClient.entities.SiteContent.filter({ key: 'studio_choice_options', page: 'Settings' }),
    ])
      .then(([commissionRecords, studioRecords]) => {
        const currentCommission = newestRecord(commissionRecords);
        const currentStudio = newestRecord(studioRecords);
        setCommissionRecord(currentCommission);
        setStudioRecord(currentStudio);
        setOptions(parseCommissionOptions(currentCommission?.value));
        setStudioOptions(parseStudioOptions(currentStudio?.value));
      })
      .catch(loadError => setError(loadError.message || 'Unable to load managed choices.'))
      .finally(() => setLoading(false));
  }, []);

  const saveRecord = (record, payload) => (
    record
      ? studioClient.entities.SiteContent.update(record.id, payload)
      : studioClient.entities.SiteContent.create(payload)
  );

  const save = async () => {
    const commission = normalizeCommissionOptions(options);
    const studio = normalizeStudioOptions(studioOptions);
    if (!commission.artworkTypes.length || !commission.budgets.length) {
      setError('Keep at least one commission artwork type and one budget range.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const [savedCommission, savedStudio] = await Promise.all([
        saveRecord(commissionRecord, {
          key: 'commission_form_options',
          label: 'Commission request form choices',
          page: 'Commission',
          group: 'Commission Request Form',
          value: JSON.stringify(commission),
        }),
        saveRecord(studioRecord, {
          key: 'studio_choice_options',
          label: 'Studio category and product choices',
          page: 'Settings',
          group: 'Content Choices',
          value: JSON.stringify(studio),
        }),
      ]);
      setCommissionRecord(savedCommission);
      setStudioRecord(savedStudio);
      setOptions(parseCommissionOptions(savedCommission.value));
      setStudioOptions(parseStudioOptions(savedStudio.value));
      onStudioOptionsSaved?.(parseStudioOptions(savedStudio.value));
      setNotice('Saved. Commission, Gallery, Video and Shop choices are now updated.');
      window.dispatchEvent(new Event('atelier:content-updated'));
    } catch (saveError) {
      setError(saveError.message || 'The managed choices could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-24"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brass/20 border-t-brass" /></div>;
  }

  return (
    <div className="max-w-4xl">
      <h1 className="mb-2 font-display text-3xl text-ivory sm:text-4xl">Forms & Categories</h1>
      <p className="mb-7 text-sm leading-relaxed text-ivory/45">
        Add, rename, reorder or remove customer choices without changing code. Put one choice on each line.
      </p>
      {error && <p role="alert" className="mb-5 border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
      {notice && <p role="status" className="mb-5 border border-green-400/30 bg-green-400/10 p-3 text-sm text-green-300">{notice}</p>}

      <section className="mb-6 border border-brass/15 bg-carbon p-4 sm:p-5">
        <h2 className="mb-1 font-display text-2xl text-ivory">Commission request</h2>
        <p className="mb-5 text-xs text-ivory/35">These choices appear in Step 2 of the public commission form.</p>
        <div className="grid gap-5 md:grid-cols-2">
          <ManagedList
            label="Artwork types"
            hint="All saved entries are shown; the form supports more than seven."
            value={options.artworkTypes}
            onChange={artworkTypes => setOptions(current => ({ ...current, artworkTypes }))}
            rows={10}
          />
          <ManagedList
            label="Budget ranges"
            hint="Use the exact wording and currency customers should see."
            value={options.budgets}
            onChange={budgets => setOptions(current => ({ ...current, budgets }))}
          />
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-xs uppercase tracking-wider text-ivory/45">
            “Other” follow-up label
            <input value={options.otherArtworkLabel} onChange={event => setOptions(current => ({ ...current, otherArtworkLabel: event.target.value }))} className="mt-2 w-full border border-brass/15 bg-obsidian px-3 py-2.5 text-sm normal-case tracking-normal text-ivory" />
          </label>
          <label className="text-xs uppercase tracking-wider text-ivory/45">
            “Other” field placeholder
            <input value={options.otherArtworkPlaceholder} onChange={event => setOptions(current => ({ ...current, otherArtworkPlaceholder: event.target.value }))} className="mt-2 w-full border border-brass/15 bg-obsidian px-3 py-2.5 text-sm normal-case tracking-normal text-ivory" />
          </label>
          <label className="text-xs uppercase tracking-wider text-ivory/45 md:col-span-2">
            Reference-image upload label
            <input value={options.referenceUploadLabel} onChange={event => setOptions(current => ({ ...current, referenceUploadLabel: event.target.value }))} className="mt-2 w-full border border-brass/15 bg-obsidian px-3 py-2.5 text-sm normal-case tracking-normal text-ivory" />
          </label>
          <label className="flex items-center gap-3 text-sm text-ivory/70 md:col-span-2">
            <input type="checkbox" checked={options.referenceUploadEnabled} onChange={event => setOptions(current => ({ ...current, referenceUploadEnabled: event.target.checked }))} className="accent-brass" />
            Let customers upload a reference image
          </label>
        </div>
      </section>

      <section className="border border-brass/15 bg-carbon p-4 sm:p-5">
        <h2 className="mb-1 font-display text-2xl text-ivory">Studio content choices</h2>
          <p className="mb-5 text-xs text-ivory/35">These lists control the Add and Edit panels in Gallery, Art Films, and the Art Shop.</p>
        <div className="grid gap-5 md:grid-cols-3">
          <ManagedList
            label="Gallery categories"
            hint="For example: Portrait Painting or Conceptual Art."
            value={studioOptions.artworkCategories}
            onChange={artworkCategories => setStudioOptions(current => ({ ...current, artworkCategories }))}
          />
          <ManagedList
            label="Video categories"
            hint="Used when uploading or editing studio films."
            value={studioOptions.videoCategories}
            onChange={videoCategories => setStudioOptions(current => ({ ...current, videoCategories }))}
          />
          <ManagedList
            label="Shop product types"
            hint="Used for artworks and products offered for sale."
            value={studioOptions.productTypes}
            onChange={productTypes => setStudioOptions(current => ({ ...current, productTypes }))}
          />
        </div>
      </section>

      <button type="button" onClick={save} disabled={saving} className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 bg-brass px-5 py-3 text-sm text-obsidian disabled:opacity-50 sm:w-fit">
        <Save size={16} /> {saving ? 'Saving…' : 'Save all choices'}
      </button>
    </div>
  );
}
