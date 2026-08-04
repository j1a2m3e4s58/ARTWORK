import { useEffect, useState } from 'react';
import { Bell, CheckCheck, CreditCard, Download, ImagePlus, Lock, MessageSquare, Package, Palette, Save, Trash2, Upload } from 'lucide-react';
import PageTransition from '@/components/PageTransition';
import { studioClient } from '@/api/studioClient';
import { useAuth } from '@/lib/AuthContext';

const statusClass = status => ({
  pending: 'text-yellow-300 bg-yellow-300/10',
  replied: 'text-green-300 bg-green-300/10',
  completed: 'text-green-300 bg-green-300/10',
  in_progress: 'text-purple-300 bg-purple-300/10',
}[status] || 'text-brass bg-brass/10');
const formatMoney = (value, currency = 'GHS') => new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency,
}).format(Number(value) || 0);
const isUnfinishedOrder = order => (
  !['paid', 'refunded', 'pay_on_delivery', 'quote_required'].includes(String(order.paymentStatus || ''))
  && !['confirmed', 'processing', 'fulfilled', 'shipped', 'delivered'].includes(String(order.status || ''))
);

export default function Account() {
  const { user, checkUserAuth, logout } = useAuth();
  const [data, setData] = useState({ messages: [], commissions: [], artRequests: [], filmRequests: [], orders: [], notifications: [] });
  const [name, setName] = useState(user?.full_name || '');
  const [chatDiscoverable, setChatDiscoverable] = useState(user?.chatDiscoverable !== false);
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [closePassword, setClosePassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [uploadingOrderId, setUploadingOrderId] = useState('');
  const [removingOrderId, setRemovingOrderId] = useState('');
  const [notificationFilter, setNotificationFilter] = useState('all');
  const [notificationCategory, setNotificationCategory] = useState('all');
  const [preferences, setPreferences] = useState({ pushEnabled: true, messages: true, community: true, orders: true, studio: true, quietHours: { enabled: false, start: '22:00', end: '07:00', timezone: 'Africa/Accra' } });

  useEffect(() => {
    Promise.all([
      studioClient.entities.Message.list('-created_date', 50),
      studioClient.entities.CommissionRequest.list('-created_date', 50),
      studioClient.entities.ArtRequest.list('-created_date', 50),
      studioClient.entities.FilmRequest.list('-created_date', 50),
      studioClient.account.orders(),
      studioClient.entities.Notification.list('-created_date', 50),
    ]).then(([messages, commissions, artRequests, filmRequests, orders, notifications]) => {
      setData({ messages, commissions, artRequests, filmRequests, orders, notifications });
    }).catch(loadError => setError(loadError.message));
  }, []);
  useEffect(() => {
    studioClient.notifications.preferences().then(setPreferences).catch(() => {});
  }, []);
  useEffect(() => {
    studioClient.notifications.list({ filter: notificationFilter, category: notificationCategory }).then(notifications => setData(current => ({ ...current, notifications }))).catch(() => {});
  }, [notificationFilter, notificationCategory]);
  const saveNotificationPreferences = async () => {
    try { setPreferences(await studioClient.notifications.updatePreferences(preferences)); setNotice('Notification preferences saved.'); }
    catch (preferenceError) { setError(preferenceError.message); }
  };
  const markAllNotificationsRead = async () => {
    await studioClient.notifications.readAll();
    setData(current => ({ ...current, notifications: current.notifications.map(item => ({ ...item, read: true })) }));
  };
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
    const updated = await studioClient.account.updateProfile({ full_name: name, chatDiscoverable, avatarUrl });
    await checkUserAuth();
    setName(updated.full_name);
    setAvatarUrl(updated.avatarUrl || '');
    setNotice('Profile updated.');
  };
  const uploadAvatar = async file => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('Choose a JPG, PNG, WebP, or other image file.');
    if (file.size > 8 * 1024 * 1024) return setError('Profile images must be 8 MB or smaller.');
    setUploadingAvatar(true); setError('');
    try {
      const uploaded = await studioClient.integrations.Core.UploadFile({ file, purpose: 'profile-avatar' });
      const updated = await studioClient.account.updateProfile({ full_name: name, chatDiscoverable, avatarUrl: uploaded.file_url });
      await checkUserAuth();
      setAvatarUrl(updated.avatarUrl || uploaded.file_url);
      window.localStorage.setItem('atelier-profile-updated', String(Date.now()));
      setNotice('Profile photo updated.');
    } catch (uploadError) { setError(uploadError.message); }
    finally { setUploadingAvatar(false); }
  };
  const removeUnfinishedOrder = async order => {
    if (!window.confirm(`Remove unfinished order ${order.trackingCode || ''} from your account?`)) return;
    setRemovingOrderId(order.id); setError('');
    try {
      await studioClient.account.removeUnfinishedOrder(order.id);
      setData(current => ({ ...current, orders: current.orders.filter(item => item.id !== order.id) }));
      setNotice('Unfinished order removed.');
    } catch (removeError) { setError(removeError.message); }
    finally { setRemovingOrderId(''); }
  };
  const removeAllUnfinishedOrders = async () => {
    const count = data.orders.filter(isUnfinishedOrder).length;
    if (!count || !window.confirm(`Remove all ${count} unfinished orders from your account?`)) return;
    setRemovingOrderId('all'); setError('');
    try {
      await studioClient.account.removeAllUnfinishedOrders();
      setData(current => ({ ...current, orders: current.orders.filter(item => !isUnfinishedOrder(item)) }));
      setNotice('All unfinished orders were removed.');
    } catch (removeError) { setError(removeError.message); }
    finally { setRemovingOrderId(''); }
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
  const uploadPaymentProof = async (order, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      setError('Choose a JPG, PNG, WebP, or AVIF screenshot no larger than 10 MB.');
      return;
    }
    setUploadingOrderId(order.id);
    setError('');
    try {
      const { file_url, media } = await studioClient.integrations.Core.UploadFile({ file });
      const updated = await studioClient.orders.submitPaymentProof(order.id, {
        paymentProofUrl: file_url,
        mediaId: media?.id,
      });
      setData(current => ({
        ...current,
        orders: current.orders.map(item => item.id === order.id ? updated : item),
      }));
      setNotice(`Payment proof received for ${updated.trackingCode || 'your order'}.`);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploadingOrderId('');
    }
  };

  const continueSecurePayment = async order => {
    setError('');
    try {
      const initialized = await studioClient.payments.initialize(order.id);
      if (!initialized.authorizationUrl) throw new Error('Paystack did not return a secure checkout link. Please try again.');
      window.location.assign(initialized.authorizationUrl);
    } catch (paymentError) {
      setError(paymentError.message);
    }
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
                <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-2xl">Notification centre</h2><p className="mt-1 text-xs text-ivory/35">Review account activity and control when this device alerts you.</p></div><button type="button" onClick={markAllNotificationsRead} className="flex min-h-9 items-center gap-2 border border-brass/20 px-3 text-[10px] uppercase tracking-wider text-brass"><CheckCheck size={14} />Mark all as read</button></div>
                <div className="mt-4 flex flex-wrap gap-2">{[['all','All'],['unread','Unread']].map(([value,label]) => <button type="button" key={value} onClick={() => setNotificationFilter(value)} className={`min-h-9 border px-3 text-xs ${notificationFilter === value ? 'border-brass bg-brass/10 text-brass' : 'border-brass/10 text-ivory/45'}`}>{label}</button>)}</div>
                <div className="mt-2 flex flex-wrap gap-2">{[['all','Every type'],['messages','Messages'],['community','Community'],['orders','Orders'],['studio','Studio']].map(([value,label]) => <button type="button" key={value} onClick={() => setNotificationCategory(value)} className={`min-h-8 border px-3 text-[10px] uppercase tracking-wider ${notificationCategory === value ? 'border-brass bg-brass/10 text-brass' : 'border-brass/10 text-ivory/40'}`}>{label}</button>)}</div>
                <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">{data.notifications.map(item => <article key={item.id} className={`border p-3 ${item.read ? 'border-ivory/5 bg-obsidian' : 'border-brass/25 bg-brass/5'}`}><div className="flex justify-between gap-3"><strong className="text-sm">{item.title}</strong><time className="shrink-0 text-[10px] text-ivory/30">{new Date(item.created_date).toLocaleDateString()}</time></div><p className="mt-1 text-xs text-ivory/50">{item.message}</p></article>)}{!data.notifications.length && <p className="py-5 text-center text-sm text-ivory/35">No notifications in this view.</p>}</div>
                <div className="mt-5 border-t border-brass/10 pt-4"><p className="text-xs uppercase tracking-wider text-brass">Alert preferences</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{[['pushEnabled','Push notifications'],['messages','Private messages'],['community','Community updates'],['orders','Order updates'],['studio','Studio activity']].map(([key,label]) => <label key={key} className="flex min-h-11 items-center justify-between border border-brass/10 px-3 text-sm text-ivory/65"><span>{label}</span><input type="checkbox" checked={Boolean(preferences[key])} onChange={event => setPreferences(value => ({ ...value, [key]: event.target.checked }))} /></label>)}</div><label className="mt-3 flex min-h-11 items-center justify-between border border-brass/10 px-3 text-sm text-ivory/65"><span>Quiet hours</span><input type="checkbox" checked={Boolean(preferences.quietHours?.enabled)} onChange={event => setPreferences(value => ({ ...value, quietHours: { ...value.quietHours, enabled: event.target.checked } }))} /></label>{preferences.quietHours?.enabled && <div className="mt-2 grid grid-cols-2 gap-2"><input type="time" value={preferences.quietHours.start} onChange={event => setPreferences(value => ({ ...value, quietHours: { ...value.quietHours, start: event.target.value } }))} className="h-11 border border-brass/10 bg-obsidian px-3 text-ivory" aria-label="Quiet hours start" /><input type="time" value={preferences.quietHours.end} onChange={event => setPreferences(value => ({ ...value, quietHours: { ...value.quietHours, end: event.target.value } }))} className="h-11 border border-brass/10 bg-obsidian px-3 text-ivory" aria-label="Quiet hours end" /></div>}<button type="button" onClick={saveNotificationPreferences} className="mt-3 min-h-10 bg-brass px-4 text-xs uppercase tracking-wider text-obsidian">Save alert preferences</button></div>
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

              <div className="border border-brass/10 bg-carbon p-5">
                <h2 className="font-display text-2xl">Studio Requests</h2>
                <p className="mt-1 text-xs text-ivory/35">Artwork sourcing and custom film lessons requested from the artist.</p>
                <div className="mt-4 space-y-3">{[...data.artRequests.map(item=>({...item,heading:item.title,body:item.description})),...data.filmRequests.map(item=>({...item,heading:item.topic,body:item.details}))].map(item=><article key={item.id} className="border border-ivory/5 bg-obsidian p-4"><div className="flex justify-between gap-3"><strong>{item.heading}</strong><span className={`px-2 py-1 text-[10px] uppercase ${statusClass(item.status)}`}>{item.status}</span></div><p className="mt-2 text-sm text-ivory/45">{item.body}</p>{(item.replies||[]).map((reply,index)=><div key={index} className="mt-3 border-l-2 border-brass/40 bg-brass/5 p-3 text-sm text-ivory/65"><p className="text-[10px] uppercase tracking-wider text-brass">Studio reply</p><p className="mt-1">{reply.text}</p></div>)}</article>)}{!data.artRequests.length&&!data.filmRequests.length&&<p className="text-sm text-ivory/35">No studio requests yet.</p>}</div>
              </div>

              <div className="border border-brass/10 bg-carbon p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h2 className="font-display text-2xl">Art Shop Orders</h2><p className="mt-1 text-xs text-ivory/35">Keep tracking details for paid and active orders. Unfinished checkout attempts disappear automatically after 24 hours.</p></div>
                  {data.orders.some(isUnfinishedOrder) && <button type="button" disabled={Boolean(removingOrderId)} onClick={removeAllUnfinishedOrders} className="flex min-h-9 items-center gap-2 border border-red-300/20 px-3 text-[10px] uppercase tracking-wider text-red-200 disabled:opacity-40"><Trash2 size={13} /> Remove all unfinished</button>}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {!data.orders.length && <p className="text-sm text-ivory/35">No shop orders yet.</p>}
                  {data.orders.map(order => (
                    <article key={order.id} className="min-w-0 border border-ivory/5 bg-obsidian p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-ivory/30">Tracking code</span>
                          <strong className="block font-display text-xl tracking-wide text-brass">{order.trackingCode || order.id.slice(0, 8)}</strong>
                        </div>
                        <div className="flex items-center gap-2"><span className={`px-2 py-1 text-[10px] uppercase ${statusClass(order.status)}`}>{String(order.status || 'pending').replaceAll('_', ' ')}</span>{isUnfinishedOrder(order) && <button type="button" disabled={Boolean(removingOrderId)} onClick={() => removeUnfinishedOrder(order)} title="Remove this unfinished order" aria-label={`Remove unfinished order ${order.trackingCode || ''}`} className="flex h-8 w-8 items-center justify-center border border-red-300/20 text-red-200 hover:bg-red-300/10 disabled:opacity-40">{removingOrderId === order.id ? <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" /> : <Trash2 size={13} />}</button>}</div>
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-ivory/45">
                        <p>{(order.items || []).map(item => `${item.title} × ${item.qty}`).join(', ')}</p>
                        <p>Delivery: {order.deliveryZone?.name || order.deliveryMethod || 'To be confirmed'}</p>
                        <p>Payment: {String(order.paymentStatus || 'awaiting_payment').replaceAll('_', ' ')}</p>
                      </div>
                      {(order.statusHistory || []).length > 0 && <details className="mt-3 border-t border-brass/10 pt-3 text-xs text-ivory/45"><summary className="cursor-pointer text-brass">View order progress</summary><ol className="mt-3 space-y-2 border-l border-brass/20 pl-3">{order.statusHistory.map((entry, index) => <li key={`${entry.status}-${entry.at}-${index}`}><span className="capitalize text-ivory/70">{String(entry.status || '').replaceAll('_', ' ')}</span>{entry.at && <span className="ml-2 text-ivory/30">{new Date(entry.at).toLocaleString()}</span>}</li>)}</ol></details>}
                      <strong className="mt-3 block font-display text-xl text-ivory">{formatMoney(order.total, order.currency)}</strong>
                      {order.paymentMethod === 'paystack' && !['paid', 'refunded'].includes(order.paymentStatus) && (
                        <button onClick={() => continueSecurePayment(order)} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 bg-brass px-3 text-xs text-obsidian">
                          <CreditCard size={13} /> Continue secure payment
                        </button>
                      )}
                      {['mobile_money', 'bank_transfer'].includes(order.paymentMethod) && !['paid', 'refunded'].includes(order.paymentStatus) && (
                        <label className="mt-3 flex min-h-10 cursor-pointer items-center justify-center gap-2 border border-brass/20 px-3 text-xs text-brass">
                          <Upload size={13} /> {uploadingOrderId === order.id ? 'Uploading…' : order.proofStatus === 'submitted' ? 'Replace payment proof' : 'Upload payment proof'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/avif"
                            className="hidden"
                            disabled={uploadingOrderId === order.id}
                            onChange={event => uploadPaymentProof(order, event.target.files?.[0])}
                          />
                        </label>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <aside className="space-y-6">
              <form onSubmit={updateProfile} className="border border-brass/10 bg-carbon p-5">
                <h2 className="font-display text-2xl">Profile</h2>
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brass/25 bg-obsidian text-xl text-brass">{avatarUrl ? <img src={avatarUrl} alt={`${name || 'Account'} profile`} className="h-full w-full object-cover" /> : (name || user?.email || '?').slice(0, 2).toUpperCase()}</div>
                  <div><label className="inline-flex min-h-10 cursor-pointer items-center gap-2 border border-brass/20 px-3 text-xs text-brass"><ImagePlus size={14} />{uploadingAvatar ? 'Uploading…' : 'Choose profile photo'}<input type="file" accept="image/*" className="hidden" disabled={uploadingAvatar} onChange={event => { uploadAvatar(event.target.files?.[0]); event.target.value = ''; }} /></label><p className="mt-2 text-xs text-ivory/35">Shown in your account and private conversations.</p></div>
                </div>
                <label className="mt-4 block text-xs uppercase tracking-wider text-ivory/35">Full name
                  <input value={name} onChange={event => setName(event.target.value)} className="mt-2 w-full border border-brass/15 bg-obsidian px-3 py-2 text-sm" />
                </label>
                <p className="mt-3 text-sm text-ivory/45">{user?.email}</p>
                <p className="mt-4 border border-brass/10 bg-obsidian/40 p-3 text-sm text-ivory/55"><b className="block text-ivory/75">Studio community messages</b>Your display name is available in the private signed-in member directory. Your email address and account details are never shown.</p>
                <label className="mt-3 flex items-start gap-3 border border-brass/10 bg-obsidian/40 p-3 text-sm text-ivory/60"><input type="checkbox" checked={chatDiscoverable} onChange={event => setChatDiscoverable(event.target.checked)} className="mt-1 h-4 w-4 accent-[#c9a65b]" /><span><b className="block text-ivory/75">Let signed-in members find me</b>Turn this off to hide your profile from new community conversations. Existing chats remain available.</span></label>
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
