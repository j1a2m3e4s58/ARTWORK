import { useEffect, useState } from 'react';
import { Download, Check } from 'lucide-react';

export default function InstallAppButton({ compact = false }) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(
    window.matchMedia?.('(display-mode: standalone)').matches
  );

  useEffect(() => {
    const capturePrompt = event => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const markInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', markInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', markInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  if (installed) {
    return (
      <span className="flex items-center gap-2 text-xs text-ivory/35">
        <Check size={14} /> App installed
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={install}
      disabled={!installPrompt}
      className={`flex items-center justify-center gap-2 rounded-xl border border-brass/25 bg-brass/10 font-tight text-brass transition-colors hover:bg-brass/15 disabled:cursor-default disabled:opacity-45 ${
        compact ? 'px-3 py-2 text-xs' : 'w-full px-4 py-3 text-sm'
      }`}
      title={!installPrompt ? 'Use your browser menu and choose “Install app”' : 'Install Reigns Atelier'}
    >
      <Download size={16} />
      {installPrompt ? 'Install app' : 'Install from browser menu'}
    </button>
  );
}
