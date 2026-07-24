import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus } from 'lucide-react';
import FileUploadField from './FileUploadField';

const PRODUCT_TYPES = ['Print', 'Framed', 'Digital Download', 'Original'];

export default function AddProductModal({ onAdd, onClose }) {
  const [form, setForm] = useState({ title: '', type: 'Print', imageUrl: '', price: '', inventory: 1, dimensions: '', description: '', isFeatured: false, status: 'draft' });

  return (
    <motion.div className="fixed inset-0 z-[9900] flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-obsidian/90 backdrop-blur-xl" onClick={onClose} />
      <motion.div className="relative z-10 w-full max-w-lg glass-panel p-8 border border-brass/20"
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-5 right-5 text-ivory/30 hover:text-brass transition-colors"><X size={16} /></button>
        <h3 className="font-display text-2xl text-ivory mb-6">Add Product</h3>
        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
          {[['Title *', 'title'], ['Price (GHS)', 'price'], ['Inventory', 'inventory'], ['Dimensions', 'dimensions']].map(([label, key]) => (
            <div key={key}>
              <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">{label}</label>
              <input value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors" />
            </div>
          ))}
          <div>
            <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">Type</label>
            <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
              className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors">
              {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <select value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value }))} className="w-full border border-brass/20 bg-obsidian px-4 py-3 text-sm text-ivory">
            <option value="draft">Save as draft</option><option value="published">Publish now</option>
          </select>
          <FileUploadField label="Product Image" value={form.imageUrl}
            onChange={url => setForm(p => ({ ...p, imageUrl: url }))} accept="image/*" placeholder="Paste URL or upload image" />
          <div>
            <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2} className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 resize-none transition-colors" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isFeatured} onChange={e => setForm(p => ({ ...p, isFeatured: e.target.checked }))} className="accent-brass" />
            <span className="text-ivory/60 text-sm">Mark as featured</span>
          </label>
        </div>
        <button onClick={() => onAdd(form)} disabled={!form.title || !form.price}
          className="w-full flex items-center justify-center gap-2 bg-brass text-obsidian py-3 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all mt-6 disabled:opacity-30">
          <Plus size={14} /> Add Product
        </button>
      </motion.div>
    </motion.div>
  );
}
