import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Pencil, Star, X, Check } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import ResponsiveSelect from '@/components/ResponsiveSelect';
import FileUploadField from './FileUploadField';

function ConfirmDelete({ onConfirm, onCancel }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onConfirm} className="px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-tight hover:bg-red-500/30 transition-colors">Delete</button>
      <button onClick={onCancel} className="px-3 py-1 border border-brass/20 text-ivory/40 text-xs font-tight hover:border-brass/40 transition-colors">Cancel</button>
    </div>
  );
}

const BLANK = { clientName: '', rating: 5, review: '', artworkType: '', location: '', artworkImageUrl: '', isFeatured: false, status: 'approved' };

function TestimonialModal({ item, onSave, onClose, title }) {
  const [form, setForm] = useState({ ...BLANK, ...item });
  return (
    <motion.div className="fixed inset-0 z-[9900] flex items-start justify-center overflow-y-auto overflow-x-hidden p-2 py-4 sm:items-center sm:p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-obsidian/90 backdrop-blur-xl" onClick={onClose} />
      <motion.div className="relative z-10 flex w-full max-w-lg min-w-0 flex-col border border-brass/20 p-4 glass-panel sm:max-h-[calc(100svh-2rem)] sm:overflow-hidden sm:p-8"
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-5 right-5 text-ivory/30 hover:text-brass transition-colors"><X size={16} /></button>
        <h3 className="font-display text-2xl text-ivory mb-6">{title}</h3>
        <div className="min-w-0 space-y-3 overflow-x-hidden sm:overflow-y-auto sm:pr-1">
          {[['Client Name *', 'clientName'], ['Artwork Type', 'artworkType'], ['Location', 'location']].map(([label, key]) => (
            <div key={key}>
              <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">{label}</label>
              <input value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors" />
            </div>
          ))}
          <div>
            <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-2">Rating</label>
            <div className="flex gap-2">
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setForm(p => ({ ...p, rating: n }))}
                  className={`text-xl transition-colors ${form.rating >= n ? 'text-brass' : 'text-ivory/20'}`}>★</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">Review *</label>
            <textarea value={form.review} onChange={e => setForm(p => ({ ...p, review: e.target.value }))}
              rows={3} className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 resize-none transition-colors" />
          </div>
          <FileUploadField label="Artwork Image" value={form.artworkImageUrl}
            onChange={url => setForm(p => ({ ...p, artworkImageUrl: url }))} accept="image/*" placeholder="Paste URL or upload image" />
          <ResponsiveSelect
            label="Publication status"
            value={form.status}
            onChange={status => setForm(current => ({ ...current, status }))}
            options={[
              { value: 'pending', label: 'Pending review' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ]}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!form.isFeatured} onChange={e => setForm(p => ({ ...p, isFeatured: e.target.checked }))} className="accent-brass" />
            <span className="text-ivory/60 text-sm">Show as featured</span>
          </label>
        </div>
        <button onClick={() => onSave(form)} disabled={!form.clientName || !form.review}
          className="w-full flex items-center justify-center gap-2 bg-brass text-obsidian py-3 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all mt-6 disabled:opacity-30">
          <Check size={14} /> Save
        </button>
      </motion.div>
    </motion.div>
  );
}

export default function TestimonialsTab() {
  const [testimonials, setTestimonials] = useState([]);
  const [confirmDel, setConfirmDel] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    studioClient.entities.Testimonial.list('-created_date', 50).then(setTestimonials);
  }, []);

  const handleAdd = async (data) => {
    const rec = await studioClient.entities.Testimonial.create(data);
    setTestimonials(prev => [rec, ...prev]);
    setShowAdd(false);
  };

  const handleUpdate = async (id, data) => {
    await studioClient.entities.Testimonial.update(id, data);
    setTestimonials(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
    setEditItem(null);
  };

  const handleDelete = async (id) => {
    await studioClient.entities.Testimonial.delete(id);
    setTestimonials(prev => prev.filter(t => t.id !== id));
    setConfirmDel(null);
  };

  return (
    <div>
      <div className="mb-8 flex items-center justify-between gap-3">
        <h1 className="font-display text-4xl text-ivory">Testimonials</h1>
        <button onClick={() => setShowAdd(true)}
          className="flex min-h-10 shrink-0 items-center gap-2 bg-brass px-3 py-2 text-xs text-obsidian transition-all hover:bg-brass-light sm:px-4 sm:text-sm">
          <Plus size={15} /> <span className="hidden min-[390px]:inline">Add Testimonial</span><span className="min-[390px]:hidden">Add</span>
        </button>
      </div>

      {testimonials.length === 0 ? (
        <p className="text-ivory/30 text-sm">No testimonials yet. Add one above.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {testimonials.map(t => (
            <div key={t.id} className="bg-carbon border border-brass/10 p-5">
              <div className="flex items-start gap-4">
                {t.artworkImageUrl && (
                  <img src={t.artworkImageUrl} alt="" className="w-14 h-14 object-cover flex-shrink-0 grayscale-[30%]" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-ivory/80 font-tight text-sm">{t.clientName}</p>
                    {t.isFeatured && <span className="text-[10px] text-brass border border-brass/30 px-1.5 py-0.5 font-tight uppercase tracking-widest">Featured</span>}
                    <span className="text-[10px] text-ivory/40 border border-ivory/10 px-1.5 py-0.5 font-tight uppercase tracking-widest">{t.status || 'pending'}</span>
                  </div>
                  <div className="flex gap-0.5 mb-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={11} className={i < (t.rating || 5) ? 'text-brass fill-brass' : 'text-ivory/20'} />
                    ))}
                  </div>
                  <p className="text-ivory/50 text-xs line-clamp-2">{t.review}</p>
                  {t.location && <p className="text-ivory/25 text-xs mt-1">{t.location}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <button onClick={() => setEditItem(t)}
                  className="flex-1 flex items-center justify-center gap-1 border border-brass/20 text-ivory/50 py-1.5 text-xs font-tight hover:border-brass/50 hover:text-brass transition-colors">
                  <Pencil size={11} /> Edit
                </button>
                {confirmDel === t.id ? (
                  <ConfirmDelete onConfirm={() => handleDelete(t.id)} onCancel={() => setConfirmDel(null)} />
                ) : (
                  <button onClick={() => setConfirmDel(t.id)}
                    className="flex items-center justify-center border border-red-500/20 text-red-400/60 px-3 py-1.5 text-xs font-tight hover:border-red-500/40 hover:text-red-400 transition-colors">
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showAdd && <TestimonialModal item={BLANK} title="Add Testimonial" onSave={handleAdd} onClose={() => setShowAdd(false)} />}
        {editItem && <TestimonialModal item={editItem} title="Edit Testimonial" onSave={data => handleUpdate(editItem.id, data)} onClose={() => setEditItem(null)} />}
      </AnimatePresence>
    </div>
  );
}
