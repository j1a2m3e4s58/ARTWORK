import { useEffect, useId, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function ResponsiveSelect({ value, onChange, options, label = 'Choose an option', disabled = false, className = '' }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const normalized = options.map(option => typeof option === 'string' ? { value: option, label: option } : option);
  const selected = normalized.find(option => option.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', close);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', close); };
  }, [open]);

  return <>
    <button type="button" disabled={disabled} onClick={() => setOpen(true)}
      className={`flex min-h-11 w-full min-w-0 items-center justify-between gap-3 border border-brass/15 bg-obsidian px-3 py-2 text-left text-sm text-ivory disabled:opacity-40 ${className}`}
      aria-haspopup="listbox" aria-expanded={open}>
      <span className="truncate capitalize">{selected?.label || label}</span><ChevronDown size={15} className="shrink-0 text-brass/65" />
    </button>
    {open && createPortal(
      <div className="fixed inset-0 z-[12000] flex items-end justify-center bg-obsidian/75 p-3 backdrop-blur-md sm:items-center" role="presentation" onMouseDown={() => setOpen(false)}>
        <div role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={event => event.stopPropagation()}
          className="max-h-[min(78svh,34rem)] w-full max-w-md overflow-hidden border border-brass/25 bg-carbon shadow-2xl">
          <div className="flex items-center justify-between border-b border-brass/15 px-4 py-3">
            <h2 id={titleId} className="font-display text-xl text-ivory">{label}</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close choices" className="flex h-10 w-10 items-center justify-center text-ivory/50"><X size={17} /></button>
          </div>
          <div role="listbox" className="max-h-[calc(min(78svh,34rem)-4rem)] overflow-y-auto overscroll-contain p-2">
            {normalized.map(option => <button type="button" role="option" aria-selected={option.value === value} key={option.value}
              onClick={() => { onChange(option.value); setOpen(false); }}
              className={`flex min-h-12 w-full items-center justify-between gap-3 border-b border-ivory/5 px-4 py-3 text-left text-sm capitalize ${option.value === value ? 'bg-brass/10 text-brass' : 'text-ivory/70 hover:bg-ivory/5'}`}>
              <span>{option.label}</span>{option.value === value && <Check size={17} />}
            </button>)}
          </div>
        </div>
      </div>,
      document.body,
    )}
  </>;
}
