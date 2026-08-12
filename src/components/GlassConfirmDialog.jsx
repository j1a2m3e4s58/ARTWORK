import { AlertTriangle, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function GlassConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title = 'Confirm deletion',
  description,
  confirmLabel = 'Delete permanently',
  busy = false,
}) {
  return (
    <AlertDialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <AlertDialogContent className="glass-panel w-[calc(100%-1.5rem)] max-w-md overflow-hidden rounded-none border border-brass/25 bg-carbon/90 p-0 text-ivory shadow-[0_28px_90px_rgba(0,0,0,.75)] backdrop-blur-2xl">
        <div className="h-px bg-gradient-to-r from-transparent via-brass/70 to-transparent" />
        <AlertDialogHeader className="relative space-y-0 p-6 pb-4 text-left sm:p-7 sm:pb-4">
          <AlertDialogCancel aria-label="Close confirmation" disabled={busy} className="absolute right-3 top-3 m-0 flex h-10 w-10 items-center justify-center rounded-full border-0 bg-transparent p-0 text-ivory/35 hover:bg-ivory/5 hover:text-ivory">
            <X size={18} />
          </AlertDialogCancel>
          <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-full border border-red-300/25 bg-red-400/10 text-red-200">
            <AlertTriangle size={20} />
          </span>
          <p className="mb-2 text-[10px] uppercase tracking-[.28em] text-brass/75">Permanent action</p>
          <AlertDialogTitle className="pr-10 font-display text-3xl font-normal text-ivory">{title}</AlertDialogTitle>
          <AlertDialogDescription className="mt-3 max-w-sm text-sm leading-6 text-ivory/55">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 border-t border-brass/10 bg-black/15 p-4 sm:p-5">
          <AlertDialogCancel disabled={busy} className="m-0 min-h-11 rounded-none border-brass/20 bg-transparent px-5 text-xs uppercase tracking-widest text-ivory/65 hover:bg-ivory/5 hover:text-ivory">Keep it</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={onConfirm} className="min-h-11 rounded-none border border-red-300/20 bg-red-500/15 px-5 text-xs uppercase tracking-widest text-red-100 hover:bg-red-500/25">
            {busy ? 'Deleting…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
