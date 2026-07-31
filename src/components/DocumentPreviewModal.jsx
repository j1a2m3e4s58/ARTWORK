import { useEffect } from 'react';
import { Download, ExternalLink, FileText, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export default function DocumentPreviewModal({ open, onClose, url, name = 'Uploaded document', mime = '' }) {
  const isPdf = mime === 'application/pdf' || /\.pdf(?:$|\?)/i.test(url || '');
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose?.(); };
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return <AnimatePresence>{open && <motion.div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <button aria-label="Close document preview" className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onClose} />
    <motion.section role="dialog" aria-modal="true" aria-label={`Preview ${name}`} className="relative flex h-[min(88dvh,900px)] w-full max-w-5xl flex-col overflow-hidden border border-brass/25 bg-carbon shadow-2xl" initial={{ opacity: 0, y: 20, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: .98 }}>
      <header className="flex shrink-0 items-center gap-3 border-b border-brass/15 px-4 py-3 sm:px-6"><div className="flex h-9 w-9 items-center justify-center border border-red-300/30 bg-red-400/10 text-red-200"><FileText size={18} /></div><p className="min-w-0 flex-1 truncate text-sm text-ivory">{name}</p><a href={url} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 border border-brass/20 px-3 py-2 text-xs text-brass sm:flex"><ExternalLink size={14} /> Open</a><a href={url} download className="hidden items-center gap-1.5 border border-brass/20 px-3 py-2 text-xs text-brass sm:flex"><Download size={14} /> Download</a><button onClick={onClose} className="flex h-10 w-10 items-center justify-center text-ivory/60 hover:text-brass"><X size={20} /></button></header>
      <div className="min-h-0 flex-1 bg-obsidian p-2 sm:p-4">{isPdf ? <iframe title={name} src={`${url}#view=FitH`} className="h-full w-full border-0 bg-white" /> : <div className="flex h-full flex-col items-center justify-center gap-4 text-center"><FileText size={48} className="text-brass" /><p className="text-sm text-ivory/60">This file cannot be previewed in the browser.</p><a href={url} target="_blank" rel="noreferrer" className="border border-brass/30 px-4 py-3 text-xs text-brass">Open file</a></div>}</div>
      <footer className="flex shrink-0 gap-2 border-t border-brass/15 p-3 sm:hidden"><a href={url} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-2 border border-brass/20 px-3 py-3 text-xs text-brass"><ExternalLink size={14} /> Open</a><a href={url} download className="flex flex-1 items-center justify-center gap-2 border border-brass/20 px-3 py-3 text-xs text-brass"><Download size={14} /> Download</a></footer>
    </motion.section>
  </motion.div>}</AnimatePresence>;
}
