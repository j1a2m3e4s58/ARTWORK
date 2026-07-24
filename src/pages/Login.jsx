import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Lock, LogIn, Mail } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import AuthLayout from '@/components/AuthLayout';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async event => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await studioClient.auth.loginViaEmailPassword(email, password);
      const redirect = new URLSearchParams(window.location.search).get('redirect') || '/';
      window.location.assign(redirect.startsWith('/') ? redirect : '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout icon={LogIn} title="Welcome back" subtitle="Sign in to continue your studio experience."
      footer={<>New to the atelier? <Link to="/register" className="text-brass hover:underline">Create an account</Link></>}>
      {error && <div className="mb-4 border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs uppercase tracking-widest text-ivory/45">Email address</span>
          <span className="relative block"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-brass/50" size={16} />
            <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-brass/15 bg-obsidian py-3 pl-10 pr-3 text-sm text-ivory outline-none focus:border-brass/50" /></span>
        </label>
        <label className="block">
          <span className="mb-1.5 flex justify-between text-xs uppercase tracking-widest text-ivory/45">Password <Link to="/forgot-password" className="normal-case tracking-normal text-brass/70">Forgot?</Link></span>
          <span className="relative block"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-brass/50" size={16} />
            <input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border border-brass/15 bg-obsidian py-3 pl-10 pr-3 text-sm text-ivory outline-none focus:border-brass/50" /></span>
        </label>
        <button disabled={loading} className="flex w-full items-center justify-center gap-2 bg-brass py-3.5 text-sm uppercase tracking-wider text-obsidian disabled:opacity-50">
          {loading && <Loader2 className="animate-spin" size={16} />} Log in
        </button>
      </form>
    </AuthLayout>
  );
}
