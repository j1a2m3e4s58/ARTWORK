import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

export default function ServiceNotice() {
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    const offline = () => setNotice('You are offline. Some studio content and account actions are unavailable.');
    const online = () => setNotice(null);
    const apiError = event => {
      if (event.detail?.status >= 500 || event.detail?.status === 0) setNotice(event.detail.message || 'The studio service is temporarily unavailable.');
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    window.addEventListener('atelier:api-error', apiError);
    if (!navigator.onLine) offline();
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      window.removeEventListener('atelier:api-error', apiError);
    };
  }, []);
  if (!notice) return null;
  return (
    <div role="alert" className="fixed inset-x-3 top-24 z-[9999] mx-auto flex max-w-xl items-center gap-3 border border-yellow-400/25 bg-carbon/95 p-3 text-sm text-yellow-100 shadow-2xl backdrop-blur-xl">
      <AlertTriangle size={17} className="shrink-0 text-yellow-300" /><span className="flex-1">{notice}</span>
      <button onClick={() => window.location.reload()} className="flex min-h-9 items-center gap-1 px-2 text-xs text-brass"><RefreshCw size={13} /> Retry</button>
      <button onClick={() => setNotice(null)} className="flex h-9 w-9 items-center justify-center" aria-label="Dismiss service notice"><X size={14} /></button>
    </div>
  );
}
