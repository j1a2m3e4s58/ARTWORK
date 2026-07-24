import { useEffect, useState } from 'react';
import { Bell, Download, Lock, MessageSquare, Package, Palette, Save, Trash2 } from 'lucide-react';
import PageTransition from '@/components/PageTransition';
import { studioClient } from '@/api/studioClient';
import { useAuth } from '@/lib/AuthContext';

const statusClass = status => ({
  pending: 'text-yellow-300 bg-yellow-300/10',
  replied: 'text-green-300 bg-green-300/10',
  completed: 'text-green-300 bg-green-300/10',
  in_progress: 'text-purple-300 bg-purple-300/10',
}[status] || 'text-brass bg-brass/10');

export default function Account() {
  const { user, checkUserAuth, logout } = useAuth();
  const [data, setData] = useState({ messages: [], commissions: [], orders: [], notifications: [] });
  const [name, setName] = useState(user?.full_name || '');
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [closePassword, setClosePassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      studioClient.entities.Message.list('-created_date', 50),
      studioClient.entities.CommissionRequest.list('-created_date', 50),
      studioClient.entities.Order.list('-created_date', 50),
      studioClient.entities.Notification.list('-created_date', 50),
    ]).then(([messages, commissions, orders, notifications]) => {
      setData({ messages, commissions, orders, notifications });
    }).catch(loadError => setError(loadError.message));
  }, []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('verify') === 'required') {
      setNotice('Verify your email address before using protected studio features.');
      window.history.replaceState({}, '', '/account');
    }
  }, []);
  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get('payment_reference');
    if (!reference) return;
    studioClient.payments.verify(reference)
      .then(result => setNotice(result.paid ? 'Payment confirmed. Your order is now being prepared.' : 'Payment has not been confirmed yet.'))
      .catch(paymentError => setError(paymentError.message))
      .finally(() => window.history.replaceState({}, '', '/account'));
  }, []);

  const updateProfile = async event => {
    event.preventDefault();
    setError('');
    const updated = await studioClient.account.updateProfile({ full_name: name });
    await checkUserAuth();
    setName(updated.full_name);
    setNotice('Profile updated.');
  };

  const changePassword = async event => {
    event.preventDefault();
    setError('');
    try {
      await studioClient.account.changePassword(passwords);
      setPasswords({ currentPassword: '', newPassword: '' });
      setNotice('Password changed securely.');
    } catch (changeError) {
      setError(changeError.message);
    }
  };

  const exportData = async () => {
    const exportPayload = await studioClient.account.export();
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reigns-atelier-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const resendVerification = async () => {
    const result = await studioClient.auth.resendVerification();
    setNotice(result.delivery?.delivered ? 'Verification email sent.' : 'Verification is ready, but email delivery must be configured by the studio.');
  };

  const removeAccount = async () => {
    if (!closePassword) return setError('Enter your current password before closing the account.');
    if (!window.confirm('Permanently close your account? Your business records will be retained only where legally required.')) return;
    try {
      await studioClient.account.remove(closePassword);
      await logout();
    } catch (removeError) {
      setError(removeError.message);
    }
  };
  const logoutAll = async () => {
    await studioClient.account.logoutAll();
    window.location.assign('/login');
  };

  const cards = [
    { label: 'Messages', value: data.messages.length, icon: MessageSquare },
    { label: 'Commissions', value: data.commissions.length, icon: Palette },
    { label: 'Orders', value: data.orders.length, icon: Package },
    { label: 'Notifications', value: data.notifications.filter(item => !item.read).length, icon: Bell },
  ];

  return (
    <PageTransition>
      <main className="min-h-screen bg-obsidian px-5 pb-28 pt-28 text-ivory md:px-10">
        <div className="mx-auto max-w-6xl">
          <p className="font-tight text-xs uppercase tracking-[0.3em] text-brass">Customer account</p>
          <h1 className="mt-2 font-display text-4xl md:text-6xl">Welcome, {user?.full_name || user?.email}</h1>
          <p className="mt-3 text-sm text-ivory/45">Track conversations, commissions and orders in one secure place.</p>
          {(notice || error) && <p role="status" className={`mt-5 border p-3 text-sm ${error ? 'border-red-400/20 text-red-300' : 'border-green-400/20 text-green-300'}`}>{error || notice}</p>}
          {user && !user.emailVerified && (
            <div className="mt-5 flex flex-col gap-3 border border-yellow-400/20 bg-yellow-400/5 p-4 text-sm text-yellow-100 sm:flex-row sm:items-center sm:justify-between">
              <span>Verify your email to keep your account recovery-ready.</span>
              <button onClick={resendVerification} className="border border-yellow-300/25 px-3 py-2 text-xs uppercase tracking-wider">Resend verification</button>
            </div>
          )}

          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            {cards.map(({ label, value, icon: Icon }) => (
              <div key={label} className="border border-brass/10 bg-carbon p-4 md:p-5">
                <Icon size={18} className="text-brass" />
                <p className="mt-4 font-display text-3xl">{value}</p>
                <p className="text-xs uppercase tracking-wider text-ivory/35">{label}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <section className="space-y-6">
              <div className="border border-brass/10 bg-carbon p-5">
                <h2 className="font-display text-2xl">Messages and replies</h2>
                <div className="mt-4 space-y-3">
                  {!data.messages.length && <p className="text-sm text-ivory/35">No messages yet.</p>}
                  {data.messages.map(message => (
                    <article key={message.id} className="border border-ivory/5 bg-obsidian p-4">
                      <div className="flex flex-wrap justify-between gap-2">
                        <h3 className="font-medium">{message.subject || 'Website message'}</h3>
                        <span className={`rounded-full px-2 py-1 text-[10px] uppercase ${statusClass(message.status)}`}>{message.status}</span>
                      </div>
                      <p className="mt-2 text-sm text-ivory/50">{message.message}</p>
                      {(message.replies || (message.reply ? [message.reply] : [])).map(reply => (
                        <div key={reply.id || reply.sentAt} className="mt-3 border-l-2 border-brass/40 bg-brass/5 p-3 text-sm text-ivory/65">
                          <p className="text-[10px] uppercase tracking-wider text-brass">Studio reply</p>
                          <p className="mt-1">{reply.text}</p>
                        </div>
                      ))}
                    </article>
                  ))}
                </div>
              </div>

              <div className="border border-brass/10 bg-carbon p-5">
                <h2 className="font-display text-2xl">Commissions</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {!data.commissions.length && <p className="text-sm text-ivory/35">No commission requests yet.</p>}
                  {data.commissions.map(item => (
                    <article key={item.id} className="border border-ivory/5 bg-obsidian p-4">
                      <div className="flex justify-between gap-2"><strong>{item.artworkType}</strong><span className={`px-2 py-1 text-[10px] uppercase ${statusClass(item.status)}`}>{item.status}</span></div>
                      <p className="mt-2 text-sm text-ivory/45">{item.package || item.budget}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <aside className="space-y-6">
              <form onSubmit={updateProfile} className="border border-brass/10 bg-carbon p-5">
                <h2 className="font-display text-2xl">Profile</h2>
                <label className="mt-4 block text-xs uppercase tracking-wider text-ivory/35">Full name
                  <input value={name} onChange={event => setName(event.target.value)} className="mt-2 w-full border border-brass/15 bg-obsidian px-3 py-2 text-sm" />
                </label>
                <p className="mt-3 text-sm text-ivory/45">{user?.email}</p>
                <button className="mt-4 flex items-center gap-2 bg-brass px-4 py-2 text-sm text-obsidian"><Save size={15} /> Save profile</button>
              </form>

              <form onSubmit={changePassword} className="border border-brass/10 bg-carbon p-5">
                <h2 className="font-display text-2xl">Security</h2>
                <input type="password" autoComplete="current-password" placeholder="Current password" value={passwords.currentPassword}
                  onChange={event => setPasswords({ ...passwords, currentPassword: event.target.value })} className="mt-4 w-full border border-brass/15 bg-obsidian px-3 py-2 text-sm" required />
                <input type="password" autoComplete="new-password" placeholder="New password (12+ characters)" value={passwords.newPassword}
                  onChange={event => setPasswords({ ...passwords, newPassword: event.target.value })} className="mt-3 w-full border border-brass/15 bg-obsidian px-3 py-2 text-sm" required minLength={12} />
                <p className="mt-2 text-xs text-ivory/35">Include uppercase, lowercase, and a number.</p>
                <button className="mt-4 flex items-center gap-2 border border-brass/25 px-4 py-2 text-sm text-brass"><Lock size={15} /> Change password</button>
                <button type="button" onClick={logoutAll} className="mt-3 flex min-h-11 w-full items-center justify-center border border-ivory/10 px-4 py-2 text-sm text-ivory/60">Sign out on every device</button>
              </form>

              <div className="border border-brass/10 bg-carbon p-5">
                <button onClick={exportData} className="flex w-full items-center gap-2 border border-ivory/10 px-4 py-3 text-sm text-ivory/65"><Download size={15} /> Download my data</button>
                <input type="password" autoComplete="current-password" value={closePassword} onChange={event => setClosePassword(event.target.value)} placeholder="Current password to close account" className="mt-3 min-h-11 w-full border border-red-400/15 bg-obsidian px-3 text-sm text-ivory" />
                <button onClick={removeAccount} className="mt-3 flex w-full items-center gap-2 border border-red-400/15 px-4 py-3 text-sm text-red-300"><Trash2 size={15} /> Close account</button>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </PageTransition>
  );
}
