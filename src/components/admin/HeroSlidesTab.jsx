import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import FileUploadField from './FileUploadField';

const EMPTY_SLIDE = {
  eyebrow: 'Reigns Atelier',
  title: '',
  accentTitle: '',
  subtitle: '',
  imageUrl: '',
  altText: '',
  sourceName: '',
  primaryLabel: 'Explore Gallery',
  primaryLink: '/gallery',
  secondaryLabel: 'Request Commission',
  secondaryLink: '/commission',
  active: true,
  status: 'draft',
  scheduledAt: '',
  sortOrder: 0,
};

function SlideForm({ initialValue, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initialValue);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  return (
    <div className="bg-carbon border border-brass/20 p-5 md:p-7 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-2xl text-ivory">{initialValue.id ? 'Edit banner' : 'New home banner'}</p>
          <p className="text-xs text-ivory/35 mt-1">The headline and buttons appear over this image on the home page.</p>
        </div>
        <button type="button" onClick={onCancel} className="text-ivory/35 hover:text-brass" aria-label="Close banner editor">
          <X size={18} />
        </button>
      </div>

      <FileUploadField
        label="Banner image *"
        value={form.imageUrl}
        onChange={value => set('imageUrl', value)}
        accept="image/*"
        placeholder="Upload a wide image or paste its URL"
      />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="font-tight text-[10px] uppercase tracking-widest text-ivory/40">Accessible image description *</span>
          <input value={form.altText || ''} onChange={event => set('altText', event.target.value)} placeholder="Describe the artwork or studio scene" className="w-full border border-brass/20 bg-obsidian px-4 py-3 text-sm text-ivory/80 focus:border-brass/50 focus:outline-none" />
        </label>
        <label className="space-y-2">
          <span className="font-tight text-[10px] uppercase tracking-widest text-ivory/40">Image source / licence</span>
          <input value={form.sourceName || ''} onChange={event => set('sourceName', event.target.value)} placeholder="Original work, Pexels, licensed…" className="w-full border border-brass/20 bg-obsidian px-4 py-3 text-sm text-ivory/80 focus:border-brass/50 focus:outline-none" />
        </label>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {[
          ['eyebrow', 'Small label'],
          ['title', 'Main heading *'],
          ['accentTitle', 'Gold italic heading'],
          ['sortOrder', 'Display order'],
        ].map(([key, label]) => (
          <label key={key} className="space-y-2">
            <span className="font-tight text-[10px] uppercase tracking-widest text-ivory/40">{label}</span>
            <input
              type={key === 'sortOrder' ? 'number' : 'text'}
              value={form[key] ?? ''}
              onChange={event => set(key, key === 'sortOrder' ? Number(event.target.value) : event.target.value)}
              className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-3 text-sm focus:outline-none focus:border-brass/50"
            />
          </label>
        ))}
      </div>

      <label className="space-y-2 block">
        <span className="font-tight text-[10px] uppercase tracking-widest text-ivory/40">Supporting text</span>
        <textarea
          value={form.subtitle}
          onChange={event => set('subtitle', event.target.value)}
          rows={3}
          className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-3 text-sm focus:outline-none focus:border-brass/50 resize-none"
        />
      </label>

      <div className="grid md:grid-cols-2 gap-4">
        {[
          ['primaryLabel', 'Primary button label'],
          ['primaryLink', 'Primary button link'],
          ['secondaryLabel', 'Secondary button label'],
          ['secondaryLink', 'Secondary button link'],
        ].map(([key, label]) => (
          <label key={key} className="space-y-2">
            <span className="font-tight text-[10px] uppercase tracking-widest text-ivory/40">{label}</span>
            <input
              value={form[key] || ''}
              onChange={event => set(key, event.target.value)}
              className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-3 text-sm focus:outline-none focus:border-brass/50"
            />
          </label>
        ))}
      </div>

      <label className="flex items-center gap-3 text-sm text-ivory/60">
        <input
          type="checkbox"
          checked={form.active !== false}
          onChange={event => set('active', event.target.checked)}
          className="accent-brass"
        />
        Visible on the home page
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2"><span className="font-tight text-[10px] uppercase tracking-widest text-ivory/40">Publishing status</span>
          <select value={form.status || 'published'} onChange={event => set('status', event.target.value)} className="w-full border border-brass/20 bg-obsidian px-4 py-3 text-sm text-ivory">
            <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
          </select>
        </label>
        <label className="space-y-2"><span className="font-tight text-[10px] uppercase tracking-widest text-ivory/40">Publish after</span>
          <input type="datetime-local" value={form.scheduledAt || ''} onChange={event => set('scheduledAt', event.target.value)} className="w-full border border-brass/20 bg-obsidian px-4 py-3 text-sm text-ivory" />
        </label>
      </div>

      <button
        type="button"
        disabled={saving || !form.title.trim() || !form.imageUrl.trim() || !form.altText?.trim()}
        onClick={() => onSave(form)}
        className="w-full bg-brass text-obsidian py-3 font-tight text-xs uppercase tracking-[0.2em] disabled:opacity-40 flex items-center justify-center gap-2"
      >
        <Save size={15} /> {saving ? 'Saving…' : 'Save banner'}
      </button>
    </div>
  );
}

export default function HeroSlidesTab() {
  const [slides, setSlides] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => studioClient.entities.HeroSlide.list('sortOrder', 100).then(setSlides).catch(error => setError(error.message));

  useEffect(() => {
    load();
  }, []);

  const save = async form => {
    setSaving(true);
    setError('');
    try {
      if (form.id) await studioClient.entities.HeroSlide.update(form.id, form);
      else await studioClient.entities.HeroSlide.create({ ...form, sortOrder: form.sortOrder || slides.length + 1 });
      setEditing(null);
      await load();
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const update = async (slide, patch) => {
    setError('');
    try {
      await studioClient.entities.HeroSlide.update(slide.id, patch);
      setSlides(current => current.map(item => item.id === slide.id ? { ...item, ...patch } : item));
    } catch (error) {
      setError(error.message);
    }
  };

  const remove = async slide => {
    if (!window.confirm(`Remove “${slide.title}” from the home banners?`)) return;
    try {
      await studioClient.entities.HeroSlide.delete(slide.id);
      setSlides(current => current.filter(item => item.id !== slide.id));
    } catch (error) {
      setError(error.message);
    }
  };

  const move = async (slide, direction) => {
    const ordered = [...slides].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const index = ordered.findIndex(item => item.id === slide.id);
    const swap = ordered[index + direction];
    if (!swap) return;
    await Promise.all([
      studioClient.entities.HeroSlide.update(slide.id, { sortOrder: swap.sortOrder }),
      studioClient.entities.HeroSlide.update(swap.id, { sortOrder: slide.sortOrder }),
    ]);
    load();
  };

  if (editing) {
    return <SlideForm initialValue={editing} onSave={save} onCancel={() => setEditing(null)} saving={saving} />;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-4xl text-ivory">Home Banners</h1>
          <p className="text-sm text-ivory/35 mt-2">Add, arrange, hide or replace every slide in the animated home hero.</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ ...EMPTY_SLIDE, sortOrder: slides.length + 1 })}
          className="bg-brass text-obsidian px-5 py-3 font-tight text-xs uppercase tracking-widest flex items-center justify-center gap-2"
        >
          <Plus size={15} /> Add banner
        </button>
      </div>

      {error && <p className="border border-red-500/30 bg-red-500/10 text-red-300 p-3 text-sm mb-5">{error}</p>}

      <div className="grid md:grid-cols-2 gap-5">
        {[...slides].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((slide, index) => (
          <article key={slide.id} className="bg-carbon border border-brass/10 overflow-hidden group">
            <div className="relative aspect-[16/8] overflow-hidden">
              <img src={slide.imageUrl} alt={slide.altText || slide.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/25 to-transparent" />
              <div className="absolute top-3 left-3 bg-obsidian/80 border border-brass/20 px-2 py-1 text-[10px] uppercase tracking-widest text-brass">
                Slide {index + 1}
              </div>
              <div className="absolute bottom-4 left-4 right-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-brass/80">{slide.eyebrow}</p>
                <h2 className="font-display text-2xl text-ivory">{slide.title} <em className="text-brass">{slide.accentTitle}</em></h2>
              </div>
            </div>
            <div className="p-4 flex items-center gap-2">
              <button onClick={() => setEditing(slide)} className="flex-1 border border-brass/20 py-2 text-xs text-ivory/60 hover:text-brass flex items-center justify-center gap-2">
                <Pencil size={12} /> Edit
              </button>
              <button onClick={() => update(slide, { active: slide.active === false })} className="border border-brass/20 p-2 text-ivory/50 hover:text-brass" aria-label={slide.active === false ? 'Show banner' : 'Hide banner'}>
                {slide.active === false ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button onClick={() => move(slide, -1)} disabled={index === 0} className="border border-brass/20 p-2 text-ivory/50 disabled:opacity-20" aria-label="Move banner earlier"><ChevronUp size={14} /></button>
              <button onClick={() => move(slide, 1)} disabled={index === slides.length - 1} className="border border-brass/20 p-2 text-ivory/50 disabled:opacity-20" aria-label="Move banner later"><ChevronDown size={14} /></button>
              <button onClick={() => remove(slide)} className="border border-red-500/20 p-2 text-red-400/60 hover:text-red-300" aria-label="Delete banner"><Trash2 size={14} /></button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
