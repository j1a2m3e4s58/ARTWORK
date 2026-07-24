import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Lock, Mail, User, UserPlus } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import AuthLayout from '@/components/AuthLayout';

export default function Register() {
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async event => {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    if (form.password.length < 10) return setError('Use at least 10 characters for your password.');
    setLoading(true);
    try {
      await studioClient.auth.register({ full_name: form.full_name, email: form.email, password: form.password });
      const redirect = new URLSearchParams(window.location.search).get('redirect') || '/';
      window.location.assign(redirect.startsWith('/') ? redirect : '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout icon={UserPlus} title="Join the atelier" subtitle="Create an account to message, commission, and use the studio assistant."
      footer={<>Already registered? <Link to="/login" className="text-brass hover:underline">Log in</Link></>}>
      {error && <div className="mb-4 border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      <form onSubmit={submit} className="space-y-4">
        {[
          { key: 'full_name', label: 'Full name', type: 'text', icon: User, autoComplete: 'name' },
          { key: 'email', label: 'Email address', type: 'email', icon: Mail, autoComplete: 'email' },
          { key: 'password', label: 'Password', type: 'password', icon: Lock, autoComplete: 'new-password' },
          { key: 'confirm', label: 'Confirm password', type: 'password', icon: Lock, autoComplete: 'new-password' },
        ].map(({ key, label, icon: Icon, ...props }) => (
          <label key={key} className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-widest text-ivory/45">{label}</span>
            <span className="relative block">
              <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-brass/50" size={16} />
              <input {...props} required value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
                className="w-full border border-brass/15 bg-obsidian py-3 pl-10 pr-3 text-sm text-ivory outline-none focus:border-brass/50" />
            </span>
          </label>
        ))}
        <button disabled={loading} className="flex w-full items-center justify-center gap-2 bg-brass py-3.5 text-sm uppercase tracking-wider text-obsidian disabled:opacity-50">
          {loading && <Loader2 className="animate-spin" size={16} />} Create account
        </button>
      </form>
    </AuthLayout>
  );
}
