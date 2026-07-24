import { createContext, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { studioClient } from '@/api/studioClient';

const AdminAccessContext = createContext(null);

export function useAdminAccess() {
  return useContext(AdminAccessContext);
}

export default function AdminAccessGate({ children }) {
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
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-obsidian px-4 py-10 text-ivory">
        <div className="noise-overlay absolute inset-0 opacity-20" />
        <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brass/5 blur-3xl" />
        <section className="relative z-10 w-full max-w-md rounded-2xl border border-brass/20 bg-carbon/95 p-6 shadow-2xl shadow-black/60 sm:p-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-brass/30 bg-brass/10 text-brass">
            <ShieldCheck size={22} />
          </div>
          <p className="font-tight text-[10px] uppercase tracking-[0.3em] text-brass/65">Protected workspace</p>
          <h1 className="mt-2 font-display text-3xl text-ivory">Unlock Studio Control</h1>
          <p className="mt-2 text-sm leading-relaxed text-ivory/45">
            You are signed in. Re-enter your account password before opening the admin workspace.
          </p>

          <form onSubmit={unlock} className="mt-7">
            <label htmlFor="admin-access-password" className="mb-2 block font-tight text-xs uppercase tracking-widest text-ivory/45">
              Admin password
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-brass/55" size={17} />
              <input
                id="admin-access-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={event => {
                  setPassword(event.target.value);
                  setError('');
                }}
                autoComplete="current-password"
                autoFocus
                className="min-h-12 w-full rounded-xl border border-brass/20 bg-obsidian px-11 pr-12 text-sm text-ivory outline-none transition-colors placeholder:text-ivory/20 focus:border-brass/55 focus:ring-2 focus:ring-brass/10"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(value => !value)}
                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-ivory/35 hover:text-brass"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}
            <button
              type="submit"
              disabled={!password || submitting}
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brass px-4 font-tight text-sm font-semibold uppercase tracking-widest text-obsidian transition-colors hover:bg-brass-light disabled:cursor-not-allowed disabled:opacity-45"
            >
              {submitting ? <Loader2 className="animate-spin" size={17} /> : <ShieldCheck size={17} />}
              {submitting ? 'Unlocking…' : 'Open admin'}
            </button>
          </form>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <Link to="/" className="rounded-xl border border-ivory/10 px-3 py-2.5 text-center text-xs text-ivory/50 hover:border-brass/25 hover:text-brass">Return to site</Link>
            <Link to="/account" className="rounded-xl border border-ivory/10 px-3 py-2.5 text-center text-xs text-ivory/50 hover:border-brass/25 hover:text-brass">My account</Link>
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
