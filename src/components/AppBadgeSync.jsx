import { useCallback, useEffect } from 'react';
import { studioClient } from '@/api/studioClient';
import { useAuth } from '@/lib/AuthContext';

const applyBadge = async count => {
  const value = Math.max(0, Number(count) || 0);
  try {
    if ('setAppBadge' in navigator && value) await navigator.setAppBadge(value);
    else if ('clearAppBadge' in navigator && !value) await navigator.clearAppBadge();
  } catch {
    // Unsupported launchers simply ignore app badges.
  }
  navigator.serviceWorker?.controller?.postMessage({ type: 'SET_APP_BADGE', count: value });
  window.dispatchEvent(new CustomEvent('atelier:badge-count', { detail: { count: value } }));
};

export default function AppBadgeSync() {
  const { user } = useAuth();
  const sync = useCallback(async () => {
    if (!user) return applyBadge(0);
    try {
      const conversations = await studioClient.chat.conversations();
      await applyBadge(conversations.reduce((sum, conversation) => sum + Number(conversation.unread || 0), 0));
    } catch {
      // Authentication/network recovery will retry on the next focus or interval.
    }
  }, [user]);

  useEffect(() => {
    sync();
    const interval = window.setInterval(sync, 20_000);
    const onVisibility = () => { if (document.visibilityState === 'visible') sync(); };
    const onRefresh = () => sync();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', sync);
    window.addEventListener('atelier:refresh-badge', onRefresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', sync);
      window.removeEventListener('atelier:refresh-badge', onRefresh);
    };
  }, [sync]);

  return null;
}
