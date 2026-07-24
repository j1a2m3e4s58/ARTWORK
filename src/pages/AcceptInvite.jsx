import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KeyRound, Loader2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { studioClient } from '@/api/studioClient';

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async event => {
    event.preventDefault();
    if (password.length < 12) return setError('Use at least 12 characters with uppercase, lowercase, and a number.');
    if (password !== confirm) return setError('Passwords do not match.');
    setLoading(true);
    setError('');
    try {
      await studioClient.auth.acceptInvite({ inviteToken, password });
      window.location.assign('/account');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout icon={KeyRound} title="Accept invitation" subtitle="Create a secure password for your Reigns Atelier account."
      footer={<Link to="/login" className="text-brass">Return to login</Link>}>
      {!inviteToken ? (
        <p className="text-center text-sm text-red-300">This invitation link is incomplete.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <p role="alert" className="border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
          <label className="block text-xs uppercase tracking-widest text-ivory/45">
            Password
            <input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)}
              className="mt-2 w-full border border-brass/20 bg-obsidian px-4 py-3 text-ivory" required minLength={12} />
          </label>
          <label className="block text-xs uppercase tracking-widest text-ivory/45">
            Confirm password
            <input type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)}
              className="mt-2 w-full border border-brass/20 bg-obsidian px-4 py-3 text-ivory" required minLength={12} />
          </label>
          <p className="text-xs normal-case tracking-normal text-ivory/40">Use 12+ characters with uppercase, lowercase, and a number.</p>
          <button disabled={loading} className="flex w-full items-center justify-center gap-2 bg-brass py-3 text-sm font-semibold text-obsidian disabled:opacity-50">
            {loading && <Loader2 size={16} className="animate-spin" />} Create account
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
