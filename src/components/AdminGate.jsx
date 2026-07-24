import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Eye, EyeOff, Shield, KeyRound, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ADMIN_CODE = 'T4N4AMEG8F5';
const RECOVERY_CODE = 'DTHC@T4N4AMEG8F5';
const STORAGE_KEY = 'ra_admin_pw';

function PasswordStrength({ password }) {
  const checks = [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'Uppercase letter', pass: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', pass: /[a-z]/.test(password) },
    { label: 'Number', pass: /[0-9]/.test(password) },
    { label: 'Special character', pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.pass).length;
  const barColor = score <= 1 ? 'bg-red-500' : score <= 2 ? 'bg-orange-400' : score <= 3 ? 'bg-yellow-400' : score === 4 ? 'bg-lime-400' : 'bg-green-500';

  return (
    <div className="mt-3 space-y-2">
      {/* Strength bar */}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= score ? barColor : 'bg-white/10'}`} />
        ))}
      </div>
      {/* Checklist */}
      <div className="grid grid-cols-1 gap-1 mt-2">
        {checks.map(c => (
          <div key={c.label} className={`flex items-center gap-2 text-xs transition-colors duration-300 ${c.pass ? 'text-green-400' : 'text-ivory/30'}`}>
            <CheckCircle2 size={11} className={c.pass ? 'text-green-400' : 'text-ivory/20'} />
            {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminGate({ open, onClose }) {
  const navigate = useNavigate();
  const [step, setStep] = useState('login'); // login | forgot | reset | success
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [savedPw, setSavedPw] = useState(() => localStorage.getItem(STORAGE_KEY) || '');

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep('login'); setCode(''); setRecovery('');
        setNewPw(''); setConfirmPw(''); setError('');
      }, 400);
    }
  }, [open]);

  const handleLogin = () => {
    const correct = savedPw ? savedPw : ADMIN_CODE;
    if (code === correct) {
      onClose();
      navigate('/admin');
    } else {
      setError('Incorrect code. Try again.');
    }
  };

  const handleRecovery = () => {
    if (recovery === RECOVERY_CODE) {
      setError('');
      setStep('reset');
    } else {
      setError('Incorrect recovery code.');
    }
  };

  const allChecks = newPw.length >= 8 && /[A-Z]/.test(newPw) && /[a-z]/.test(newPw) && /[0-9]/.test(newPw) && /[^A-Za-z0-9]/.test(newPw);

  const handleReset = () => {
    if (!allChecks) { setError('Password does not meet all requirements.'); return; }
    if (newPw !== confirmPw) { setError('Passwords do not match.'); return; }
    localStorage.setItem(STORAGE_KEY, newPw);
    setSavedPw(newPw);
    setStep('success');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[99000] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div className="absolute inset-0 bg-obsidian/90 backdrop-blur-2xl" onClick={onClose} />
          <motion.div
            className="relative z-10 w-full max-w-sm"
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="glass-panel p-8 border border-brass/20">
              <button onClick={onClose} className="absolute top-5 right-5 text-ivory/30 hover:text-brass transition-colors"><X size={16} /></button>

              {/* Icon */}
              <div className="w-12 h-12 border border-brass/30 flex items-center justify-center mb-6">
                <Shield size={20} className="text-brass" />
              </div>

              {/* ── LOGIN ── */}
              {step === 'login' && (
                <>
                  <h2 className="font-display text-2xl text-ivory mb-1">Admin Access</h2>
                  <p className="text-ivory/40 text-sm mb-6">Enter your admin code to continue.</p>
                  <div className="relative mb-2">
                    <input
                      type={showPw ? 'text' : 'password'}
                      placeholder="Enter access code"
                      value={code}
                      onChange={e => { setCode(e.target.value); setError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleLogin()}
                      className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-3 pr-10 placeholder:text-ivory/25 focus:outline-none focus:border-brass/50 text-sm transition-colors"
                    />
                    <button onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory/30 hover:text-brass transition-colors">
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
                  <button onClick={handleLogin}
                    className="w-full flex items-center justify-center gap-2 bg-brass text-obsidian py-3 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all mt-4">
                    Open Admin <ArrowRight size={14} />
                  </button>
                  <button onClick={() => { setStep('forgot'); setError(''); }}
                    className="w-full text-center text-ivory/30 hover:text-brass text-xs font-tight mt-4 transition-colors">
                    Forgot password?
                  </button>
                </>
              )}

              {/* ── FORGOT ── */}
              {step === 'forgot' && (
                <>
                  <h2 className="font-display text-2xl text-ivory mb-1">Recovery</h2>
                  <p className="text-ivory/40 text-sm mb-6">Enter your recovery code to reset the password.</p>
                  <input
                    type="text"
                    placeholder="Recovery code"
                    value={recovery}
                    onChange={e => { setRecovery(e.target.value); setError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleRecovery()}
                    className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-3 placeholder:text-ivory/25 focus:outline-none focus:border-brass/50 text-sm transition-colors mb-2"
                  />
                  {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
                  <button onClick={handleRecovery}
                    className="w-full flex items-center justify-center gap-2 bg-brass text-obsidian py-3 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all mt-4">
                    Verify <KeyRound size={14} />
                  </button>
                  <button onClick={() => { setStep('login'); setError(''); }}
                    className="w-full text-center text-ivory/30 hover:text-brass text-xs font-tight mt-4 transition-colors">
                    ← Back to login
                  </button>
                </>
              )}

              {/* ── RESET PASSWORD ── */}
              {step === 'reset' && (
                <>
                  <h2 className="font-display text-2xl text-ivory mb-1">New Password</h2>
                  <p className="text-ivory/40 text-sm mb-6">Set a strong new admin password.</p>

                  <div className="relative mb-4">
                    <input
                      type={showPw ? 'text' : 'password'}
                      placeholder="New password"
                      value={newPw}
                      onChange={e => { setNewPw(e.target.value); setError(''); }}
                      className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-3 pr-10 placeholder:text-ivory/25 focus:outline-none focus:border-brass/50 text-sm transition-colors"
                    />
                    <button onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory/30 hover:text-brass transition-colors">
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>

                  {/* Live password strength */}
                  {newPw && <PasswordStrength password={newPw} />}

                  <div className="relative mt-4 mb-2">
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="Confirm new password"
                      value={confirmPw}
                      onChange={e => { setConfirmPw(e.target.value); setError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleReset()}
                      className={`w-full bg-obsidian border text-ivory/80 px-4 py-3 pr-10 placeholder:text-ivory/25 focus:outline-none text-sm transition-colors ${
                        confirmPw && confirmPw === newPw ? 'border-green-500/50' : confirmPw ? 'border-red-500/40' : 'border-brass/20 focus:border-brass/50'
                      }`}
                    />
                    <button onClick={() => setShowConfirm(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory/30 hover:text-brass transition-colors">
                      {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {confirmPw && confirmPw === newPw && (
                    <p className="text-green-400 text-xs flex items-center gap-1"><CheckCircle2 size={11} /> Passwords match</p>
                  )}
                  {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

                  <button onClick={handleReset}
                    className="w-full flex items-center justify-center gap-2 bg-brass text-obsidian py-3 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all mt-5">
                    Save Password <ArrowRight size={14} />
                  </button>
                </>
              )}

              {/* ── SUCCESS ── */}
              {step === 'success' && (
                <div className="text-center">
                  <CheckCircle2 size={40} className="text-green-400 mx-auto mb-4" />
                  <h2 className="font-display text-2xl text-ivory mb-2">Password Updated</h2>
                  <p className="text-ivory/40 text-sm mb-6">Your new password is active. You can now log in.</p>
                  <button onClick={() => setStep('login')}
                    className="w-full flex items-center justify-center gap-2 bg-brass text-obsidian py-3 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all">
                    Go to Login <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}