import { useEffect, useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { studioClient } from '@/api/studioClient';

const applicationServerKey = value => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = window.atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(character => character.charCodeAt(0)));
};

export default function NotificationPermissionPrompt() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Never miss a studio reply, order update or new artwork.');

  useEffect(() => {
    if (!user || user.role !== 'customer' || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return undefined;
    let active = true;
    let timer;
    navigator.serviceWorker.ready
      .then(registration => registration.pushManager.getSubscription())
      .then(subscription => {
        if (!active || (window.Notification.permission === 'granted' && subscription)) return;
        timer = window.setTimeout(() => setVisible(true), 7000);
      })
      .catch(() => {});
    return () => { active = false; window.clearTimeout(timer); };
  }, [user?.id, user?.role]);

  const enable = async () => {
    setBusy(true);
    try {
      if (window.Notification.permission === 'denied') {
        setMessage('Notifications are blocked. Open this site’s browser settings and choose Allow, then try again.');
        return;
      }
      const config = await studioClient.push.config();
      if (!config.configured) throw new Error('Studio notifications are temporarily unavailable. Please try again later.');
      const permission = await window.Notification.requestPermission();
      if (permission !== 'granted') {
        setMessage('Choose Allow in the browser prompt to receive studio updates.');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(config.publicKey) });
      await studioClient.push.subscribe(subscription.toJSON());
      setVisible(false);
    } catch (error) {
      setMessage(error.message || 'Notifications could not be enabled. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;
  return (
    <aside className="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[9800] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-brass/25 bg-carbon/95 p-3 shadow-2xl backdrop-blur-xl sm:bottom-5 sm:p-4" role="dialog" aria-label="Enable Reigns Atelier notifications">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brass/12 text-brass"><BellRing size={20} /></span>
      <div className="min-w-0 flex-1"><b className="block text-sm text-ivory">Stay close to the studio</b><p className="mt-0.5 text-xs leading-5 text-ivory/55">{message}</p></div>
      <button type="button" disabled={busy} onClick={enable} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-brass px-4 text-xs font-semibold text-obsidian disabled:opacity-50">{busy && <Loader2 size={13} className="animate-spin" />}Allow</button>
    </aside>
  );
}
