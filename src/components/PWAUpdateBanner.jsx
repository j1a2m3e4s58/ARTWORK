import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

export default function PWAUpdateBanner() {
  const [registration, setRegistration] = useState(null);
  useEffect(() => {
    const handler = event => setRegistration(event.detail);
    window.addEventListener('atelier:update-ready', handler);
    return () => window.removeEventListener('atelier:update-ready', handler);
  }, []);
  if (!registration) return null;
  return (
    <div className="fixed bottom-24 left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-3 border border-brass/25 bg-carbon px-4 py-3 text-sm text-ivory shadow-2xl md:bottom-6">
      <span>A new version is ready.</span>
      <button onClick={() => { registration.waiting?.postMessage({ type: 'SKIP_WAITING' }); window.location.reload(); }}
        className="flex items-center gap-1 text-brass"><RefreshCw size={14} /> Update</button>
    </div>
  );
}
