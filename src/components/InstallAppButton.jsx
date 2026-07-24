import { useEffect, useState } from 'react';
import { Check, Download, MoreVertical, Share2, X } from 'lucide-react';

const pwaState = window.__atelierPwaInstallState ||= {
  prompt: null,
  installed: window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true,
  listeners: new Set(),
  initialized: false,
};

const notify = () => pwaState.listeners.forEach(listener => listener({
  prompt: pwaState.prompt,
  installed: pwaState.installed,
}));

if (!pwaState.initialized) {
  pwaState.initialized = true;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pwaState.prompt = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    pwaState.installed = true;
    pwaState.prompt = null;
    notify();
  });
}

export default function InstallAppButton({ compact = false }) {
  const [state, setState] = useState({ prompt: pwaState.prompt, installed: pwaState.installed });
  const [showHelp, setShowHelp] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent);

  useEffect(() => {
    pwaState.listeners.add(setState);
    setState({ prompt: pwaState.prompt, installed: pwaState.installed });
    return () => pwaState.listeners.delete(setState);
  }, []);

  const install = async () => {
    if (!state.prompt) {
      setShowHelp(true);
      return;
    }
    setPrompting(true);
    try {
      await state.prompt.prompt();
      const choice = await state.prompt.userChoice;
      pwaState.prompt = null;
      if (choice.outcome === 'accepted') pwaState.installed = true;
      notify();
    } finally {
      setPrompting(false);
    }
  };

  if (state.installed) {
    return (
      <span className={`flex items-center justify-center gap-2 text-ivory/45 ${compact ? 'text-xs' : 'py-2 text-sm'}`}>
        <Check size={14} className="text-green-400" /> App installed
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={install}
        disabled={prompting}
        className={`flex items-center justify-center gap-2 rounded-xl border border-brass/25 bg-brass/10 font-tight text-brass transition-colors hover:bg-brass/15 disabled:cursor-wait disabled:opacity-60 ${
          compact ? 'px-3 py-2 text-xs' : 'w-full px-4 py-3 text-sm'
        }`}
        title={state.prompt ? 'Install Reigns Atelier' : 'Show browser installation instructions'}
      >
        <Download size={16} />
        {prompting ? 'Opening install…' : state.prompt ? 'Install app' : 'Install from browser'}
      </button>

      {showHelp && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="install-help-title">
          <div className="relative w-full max-w-sm rounded-2xl border border-brass/20 bg-carbon p-6 text-left shadow-2xl">
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-ivory/10 text-ivory/45 hover:border-brass/30 hover:text-brass"
              aria-label="Close installation instructions"
            >
              <X size={17} />
            </button>
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-brass/10 text-brass">
              <Download size={20} />
            </div>
            <h2 id="install-help-title" className="font-display text-2xl text-ivory">Install Reigns Atelier</h2>
            <p className="mt-2 text-sm leading-relaxed text-ivory/45">
              The browser has not offered its automatic install prompt yet. You can still install the app from the browser menu.
            </p>
            {isAppleMobile ? (
              <ol className="mt-5 space-y-3 text-sm text-ivory/65">
                <li className="flex gap-3"><Share2 size={18} className="mt-0.5 shrink-0 text-brass" /><span>Tap the <strong className="text-ivory">Share</strong> button in Safari.</span></li>
                <li className="flex gap-3"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-brass/30 text-[10px] text-brass">2</span><span>Choose <strong className="text-ivory">Add to Home Screen</strong>, then tap Add.</span></li>
              </ol>
            ) : (
              <ol className="mt-5 space-y-3 text-sm text-ivory/65">
                <li className="flex gap-3"><MoreVertical size={18} className="mt-0.5 shrink-0 text-brass" /><span>Open your browser’s menu.</span></li>
                <li className="flex gap-3"><Download size={18} className="mt-0.5 shrink-0 text-brass" /><span>Choose <strong className="text-ivory">Install Reigns Atelier</strong> or <strong className="text-ivory">Add to Home screen</strong>.</span></li>
              </ol>
            )}
            <button type="button" onClick={() => setShowHelp(false)} className="mt-6 min-h-11 w-full rounded-xl bg-brass px-4 text-sm font-semibold text-obsidian hover:bg-brass-light">
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
