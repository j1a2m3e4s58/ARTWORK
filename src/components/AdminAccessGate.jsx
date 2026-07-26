import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/lib/AuthContext';

const AdminAccessContext = createContext(null);

export function useAdminAccess() {
  return useContext(AdminAccessContext);
}

export default function AdminAccessGate({ children }) {
  const settings = useSettings();
  const { user, checkUserAuth } = useAuth();
  const passwordRef = useRef(null);
  const [checking, setChecking] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaSetup, setMfaSetup] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    studioClient.admin.access()
      .then(result => {
        if (active) {
          setUnlocked(Boolean(result.unlocked));
          setMfaRequired(Boolean(result.mfaRequired));
        }
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
      if (/multi-factor/i.test(unlockError.message)) setMfaRequired(true);
      setError(unlockError.message);
      setPassword('');
      window.requestAnimationFrame(() => passwordRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  };

  const startMfa = async () => {
    setError('');
    try {
      setMfaSetup(await studioClient.mfa.setup());
    } catch (setupError) {
      setError(setupError.message);
    }
  };

  const enableMfa = async event => {
    event.preventDefault();
    if (mfaCode.length !== 6 || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await studioClient.mfa.enable(mfaCode);
      await checkUserAuth();
      setMfaRequired(false);
      setMfaSetup(null);
      setMfaCode('');
      window.requestAnimationFrame(() => passwordRef.current?.focus());
    } catch (enableError) {
      setError(enableError.message);
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

  if (mfaRequired && user?.role === 'admin') {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-obsidian px-4 py-8 text-ivory">
        <div className="absolute inset-0 bg-gradient-to-br from-violet/30 via-obsidian to-obsidian" aria-hidden="true" />
        <section className="relative z-10 w-full max-w-lg border border-brass/25 bg-carbon/80 p-5 shadow-2xl backdrop-blur-2xl sm:p-7">
          <div className="mb-5 flex h-10 w-10 items-center justify-center border border-brass/35 bg-brass/10 text-brass"><ShieldCheck size={19} /></div>
          <p className="font-tight text-[10px] uppercase tracking-[0.3em] text-brass/65">Required security setup</p>
          <h1 className="mt-2 font-display text-3xl text-ivory">Protect Studio Control</h1>
          <p className="mt-2 text-sm leading-relaxed text-ivory/55">
            Production administrators must connect an authenticator app before accessing studio records.
          </p>
          {!mfaSetup ? (
            <button onClick={startMfa} className="mt-6 min-h-12 w-full bg-brass px-4 text-sm font-semibold uppercase tracking-wider text-obsidian">
              Set up authenticator
            </button>
          ) : (
            <form onSubmit={enableMfa} className="mt-6 grid gap-5 sm:grid-cols-[180px_1fr]">
              <img src={mfaSetup.qrDataUrl} alt="Authenticator QR code" className="h-44 w-44 bg-white p-2" />
              <div>
                <p className="text-xs text-ivory/45">Scan the QR code with Google Authenticator, Microsoft Authenticator, Authy, or your password manager.</p>
                <code className="mt-3 block break-all text-xs text-brass">{mfaSetup.manualKey}</code>
                <label htmlFor="admin-mfa-code" className="mt-4 block text-xs uppercase tracking-wider text-ivory/45">Six-digit code</label>
                <input id="admin-mfa-code" value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric" autoComplete="one-time-code" className="mt-2 min-h-11 w-full border border-brass/25 bg-obsidian px-3 text-center tracking-[0.35em] text-ivory" />
                <button disabled={mfaCode.length !== 6 || submitting} className="mt-3 min-h-11 w-full bg-brass px-3 text-sm text-obsidian disabled:opacity-40">
                  {submitting ? 'Verifying…' : 'Verify and continue'}
                </button>
              </div>
            </form>
          )}
          {error && <p className="mt-4 border-l-2 border-red-400 bg-red-400/10 px-3 py-2 text-sm text-red-200" role="alert">{error}</p>}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Link to="/" className="border border-ivory/15 px-3 py-2.5 text-center text-xs text-ivory/55">Return to site</Link>
            <Link to="/account" className="border border-ivory/15 px-3 py-2.5 text-center text-xs text-ivory/55">My account</Link>
          </div>
        </section>
      </main>
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
