import { useEffect, useId, useRef } from 'react';

const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

export default function TurnstileWidget({ onToken }) {
  const id = useId().replace(/:/g, '');
  const widgetRef = useRef(null);
  useEffect(() => {
    if (!siteKey) return undefined;
    const render = () => {
      if (!window.turnstile || widgetRef.current !== null) return;
      widgetRef.current = window.turnstile.render(`#turnstile-${id}`, {
        sitekey: siteKey,
        theme: 'dark',
        callback: onToken,
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    };
    const existing = document.querySelector('script[data-atelier-turnstile]');
    if (existing) render();
    else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.atelierTurnstile = 'true';
      script.addEventListener('load', render);
      document.head.appendChild(script);
    }
    return () => {
      if (widgetRef.current !== null && window.turnstile) window.turnstile.remove(widgetRef.current);
    };
  }, [id, onToken]);
  if (!siteKey) return null;
  return <div id={`turnstile-${id}`} className="min-h-[65px]" aria-label="Human verification" />;
}
