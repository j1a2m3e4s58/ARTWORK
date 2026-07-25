import { AlertTriangle, LoaderCircle, RefreshCw } from 'lucide-react';

export default function ResourceFeedback({ loading, error, empty, emptyMessage, onRetry }) {
  if (loading) {
    return (
      <div className="border border-brass/10 py-16 text-center" role="status" aria-live="polite">
        <LoaderCircle className="mx-auto mb-3 animate-spin text-brass/70" size={22} aria-hidden="true" />
        <p className="font-tight text-sm text-ivory/45">Loading studio content…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="border border-red-400/20 bg-red-400/5 px-6 py-12 text-center" role="alert">
        <AlertTriangle className="mx-auto mb-3 text-red-300" size={22} aria-hidden="true" />
        <p className="font-tight text-sm text-ivory/70">We could not load this section.</p>
        <p className="mx-auto mt-2 max-w-xl text-xs text-ivory/75">{error}</p>
        <button type="button" onClick={onRetry} className="mt-5 inline-flex items-center gap-2 border border-brass/30 px-5 py-2.5 text-xs uppercase tracking-widest text-brass hover:bg-brass hover:text-obsidian">
          <RefreshCw size={13} aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }
  if (empty) {
    return <div className="border border-brass/10 py-16 text-center text-sm text-ivory/35">{emptyMessage}</div>;
  }
  return null;
}
