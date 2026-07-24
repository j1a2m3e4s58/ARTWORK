import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import { useSettings } from '@/hooks/useSettings';

const AdminAccessContext = createContext(null);

export function useAdminAccess() {
  return useContext(AdminAccessContext);
}

export default function AdminAccessGate({ children }) {
  const settings = useSettings();
  const passwordRef = useRef(null);
  const [checking, setChecking] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    studioClient.admin.access()
      .then(result => {
        if (active) setUnlocked(Boolean(result.unlocked));
      })
      .catch(() => {
        if (active) setUnlocked(false);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    const handleExpiredAccess = event => {
      if (event.detail?.code === 'admin_unlock_required') {
        setUnlocked(false);
        setError('Your secure admin session expired. Enter your password again.');
      }
    };
    window.addEventListener('atelier:api-error', handleExpiredAccess);
    return () => {
      active = false;
      window.removeEventListener('atelier:api-error', handleExpiredAccess);
    };
  }, []);

  const unlock = async event => {
    event.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await studioClient.admin.unlock(password);
      setPassword('');
      setUnlocked(true);
    } catch (unlockError) {
      setError(unlockError.message);
      setPassword('');
      window.requestAnimationFrame(() => passwordRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  };

  const lock = async () => {
    try {
      await studioClient.admin.lock();
    } finally {
      setPassword('');
      setUnlocked(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-obsidian text-brass">
        <Loader2 className="animate-spin" size={28} aria-label="Checking secure admin access" />
      </div>
    );
  }

  if (!unlocked) {
    const backgroundImage = settings.hero_image_1 || '/brand/reigns-atelier-logo.jpg';
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-obsidian px-4 py-8 text-ivory">
        <div
          className="absolute -inset-3 scale-105 bg-cover bg-center opacity-50 blur-[5px]"
          style={{ backgroundImage: `url("${backgroundImage}")` }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-obsidian/55 via-obsidian/35 to-obsidian/65" />
        <div className="noise-overlay absolute inset-0 opacity-25" />
        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 bg-brass/10 blur-3xl" />
        <section className="relative z-10 w-full max-w-sm border border-brass/25 bg-carbon/55 p-5 shadow-2xl shadow-black/45 backdrop-blur-2xl sm:p-6">
          <span className="absolute -left-px -top-px h-5 w-5 border-l-2 border-t-2 border-brass/70" aria-hidden="true" />
          <span className="absolute -bottom-px -right-px h-5 w-5 border-b-2 border-r-2 border-brass/70" aria-hidden="true" />
          <div className="mb-5 flex h-10 w-10 items-center justify-center border border-brass/35 bg-brass/10 text-brass">
            <ShieldCheck size={19} />
          </div>
          <p className="font-tight text-[10px] uppercase tracking-[0.3em] text-brass/65">Protected workspace</p>
          <h1 className="mt-2 font-display text-[1.7rem] leading-tight text-ivory">Unlock Studio Control</h1>
          <p className="mt-2 text-sm leading-relaxed text-ivory/55">
            You are signed in. Re-enter your account password before opening the admin workspace.
          </p>

          <form onSubmit={unlock} className="mt-6">
            <label htmlFor="admin-access-password" className="mb-2 block font-tight text-xs uppercase tracking-widest text-ivory/45">
              Admin password
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-brass/55" size={17} />
              <input
                ref={passwordRef}
                id="admin-access-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={event => {
                  setPassword(event.target.value);
                  setError('');
                }}
                autoComplete="current-password"
                autoFocus
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'admin-access-error' : undefined}
                className="admin-access-input min-h-12 w-full border border-brass/25 bg-obsidian/70 px-11 pr-[4.5rem] text-sm text-ivory caret-brass outline-none transition-colors placeholder:text-ivory/25 focus:border-brass/70 focus:ring-2 focus:ring-brass/15"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(value => !value)}
                className="absolute right-1 top-1/2 flex h-10 -translate-y-1/2 items-center justify-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-ivory/60 hover:bg-brass/10 hover:text-brass"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {error && (
              <p id="admin-access-error" className="mt-3 border-l-2 border-red-400 bg-red-400/10 px-3 py-2 text-sm text-red-200" role="alert">
                {error} Please try again.
              </p>
            )}
            <button
              type="submit"
              disabled={!password || submitting}
              className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 bg-brass px-4 font-tight text-sm font-semibold uppercase tracking-widest text-obsidian transition-colors hover:bg-brass-light disabled:cursor-not-allowed disabled:opacity-45"
            >
              {submitting ? <Loader2 className="animate-spin" size={17} /> : <ShieldCheck size={17} />}
              {submitting ? 'Unlocking…' : 'Open admin'}
            </button>
          </form>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link to="/" className="border border-ivory/15 bg-obsidian/25 px-3 py-2.5 text-center text-xs text-ivory/55 hover:border-brass/35 hover:text-brass">Return to site</Link>
            <Link to="/account" className="border border-ivory/15 bg-obsidian/25 px-3 py-2.5 text-center text-xs text-ivory/55 hover:border-brass/35 hover:text-brass">My account</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <AdminAccessContext.Provider value={{ lock }}>
      {children}
    </AdminAccessContext.Provider>
  );
}
