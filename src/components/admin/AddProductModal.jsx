import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus } from 'lucide-react';
import FileUploadField from './FileUploadField';
import ResponsiveSelect from '@/components/ResponsiveSelect';
import { DEFAULT_STUDIO_OPTIONS } from '@/lib/studioOptions';

export default function AddProductModal({ onAdd, onClose, productTypes = DEFAULT_STUDIO_OPTIONS.productTypes }) {
  const [form, setForm] = useState({ title: '', type: productTypes[0] || '', imageUrl: '', price: '', inventory: 1, dimensions: '', description: '', isFeatured: false, status: 'draft' });

  return (
    <motion.div className="fixed inset-0 z-[9900] flex items-start justify-center overflow-y-auto overflow-x-hidden p-2 py-4 sm:items-center sm:p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-obsidian/90 backdrop-blur-xl" onClick={onClose} />
      <motion.div className="glass-panel relative z-10 flex w-full max-w-lg min-w-0 flex-col border border-brass/20 p-4 sm:max-h-[calc(100svh-2rem)] sm:overflow-hidden sm:p-7"
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-5 right-5 text-ivory/30 hover:text-brass transition-colors"><X size={16} /></button>
        <h3 className="font-display text-2xl text-ivory mb-6">Add Product</h3>
        <div className="min-w-0 space-y-3 overflow-x-hidden sm:overflow-y-auto sm:pr-1">
          {[['Title *', 'title'], ['Price (GHS)', 'price'], ['Inventory', 'inventory'], ['Dimensions', 'dimensions']].map(([label, key]) => (
            <div key={key}>
              <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">{label}</label>
              <input value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors" />
            </div>
          ))}
          <div>
            <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">Type</label>
            <ResponsiveSelect label="Choose product type" value={form.type} onChange={type => setForm(p => ({ ...p, type }))} options={productTypes} />
          </div>
          <ResponsiveSelect label="Publishing status" value={form.status} onChange={status => setForm(current => ({ ...current, status }))} options={[{ value: 'draft', label: 'Save as draft' }, { value: 'published', label: 'Publish now' }]} />
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
