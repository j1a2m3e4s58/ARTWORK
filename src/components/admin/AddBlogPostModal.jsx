import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus } from 'lucide-react';
import FileUploadField from './FileUploadField';

export default function AddBlogPostModal({ onAdd, onClose }) {
  const [form, setForm] = useState({ title: '', slug: '', content: '', coverImageUrl: '', excerpt: '', publishedDate: '', readTime: '', author: 'Reigns Atelier' });

  const autoSlug = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  return (
    <motion.div className="fixed inset-0 z-[9900] flex items-start justify-center overflow-y-auto overflow-x-hidden p-2 py-4 sm:items-center sm:p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-obsidian/90 backdrop-blur-xl" onClick={onClose} />
      <motion.div className="relative z-10 flex w-full max-w-lg min-w-0 flex-col border border-brass/20 p-4 glass-panel sm:max-h-[calc(100svh-2rem)] sm:overflow-hidden sm:p-8"
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-5 right-5 text-ivory/30 hover:text-brass transition-colors"><X size={16} /></button>
        <h3 className="font-display text-2xl text-ivory mb-6">Add Blog Post</h3>
        <div className="min-w-0 space-y-3 overflow-x-hidden sm:overflow-y-auto sm:pr-1">
          <div>
            <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">Title *</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value, slug: autoSlug(e.target.value) }))}
              className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors" />
          </div>
          <div>
            <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">Slug (URL)</label>
            <input value={form.slug} onChange={e => setForm(p => ({ ...p, slug: e.target.value }))}
              className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors" />
          </div>
          <FileUploadField label="Cover Image" value={form.coverImageUrl}
            onChange={url => setForm(p => ({ ...p, coverImageUrl: url }))} accept="image/*" placeholder="Paste URL or upload image" />
          <div>
            <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">Excerpt</label>
            <textarea value={form.excerpt} onChange={e => setForm(p => ({ ...p, excerpt: e.target.value }))}
              rows={2} className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 resize-none transition-colors" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">Published Date</label>
              <input type="date" value={form.publishedDate} onChange={e => setForm(p => ({ ...p, publishedDate: e.target.value }))}
                className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors" />
            </div>
            <div>
              <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">Read Time (min)</label>
              <input type="number" value={form.readTime} onChange={e => setForm(p => ({ ...p, readTime: e.target.value }))}
                className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors" />
            </div>
          </div>
          <div>
            <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">Content *</label>
            <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
              rows={5} className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 resize-none transition-colors" />
          </div>
        </div>
        <button onClick={() => onAdd(form)} disabled={!form.title || !form.content}
          className="w-full flex items-center justify-center gap-2 bg-brass text-obsidian py-3 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all mt-6 disabled:opacity-30">
          <Plus size={14} /> Add Blog Post
        </button>
      </motion.div>
    </motion.div>
  );
}
