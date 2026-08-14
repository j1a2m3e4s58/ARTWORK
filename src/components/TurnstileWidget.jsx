import { useEffect, useId, useRef } from 'react';
import { useState } from 'react';

const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

export default function TurnstileWidget({ onToken }) {
  const id = useId().replace(/:/g, '');
  const widgetRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [retryKey, setRetryKey] = useState(0);
  const [errorCode, setErrorCode] = useState('');
  useEffect(() => {
    if (!siteKey) return undefined;
    const fail = code => {
      setErrorCode(String(code || ''));
      setStatus('error');
    };
    const render = () => {
      if (!window.turnstile || widgetRef.current !== null) return;
      widgetRef.current = window.turnstile.render(`#turnstile-${id}`, {
        sitekey: siteKey,
        theme: 'dark',
        callback: token => {
          setErrorCode('');
          setStatus('ready');
          onToken(token);
        },
        'expired-callback': () => {
          setStatus('expired');
          onToken('');
        },
        'error-callback': code => {
          fail(code);
          onToken('');
          return true;
        },
      });
    };
    const existing = document.querySelector('script[data-atelier-turnstile]');
    let createdScript;
    if (existing) {
      if (window.turnstile) render();
      else {
        existing.addEventListener('load', render);
        existing.addEventListener('error', fail);
      }
    }
    else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.atelierTurnstile = 'true';
      script.addEventListener('load', render);
      script.addEventListener('error', fail);
      document.head.appendChild(script);
      createdScript = script;
    }
    const timeout = window.setTimeout(() => {
      if (widgetRef.current === null) fail();
    }, 12_000);
    return () => {
      window.clearTimeout(timeout);
      existing?.removeEventListener('load', render);
      existing?.removeEventListener('error', fail);
      createdScript?.removeEventListener('load', render);
      createdScript?.removeEventListener('error', fail);
      if (widgetRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetRef.current);
        widgetRef.current = null;
      }
    };
  }, [id, onToken, retryKey]);
  if (!siteKey) return null;
  return (
    <div role="group" aria-label="Human verification">
      <div id={`turnstile-${id}`} className="min-h-[65px]" />
      {status === 'error' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-red-300" role="alert">
          <span>{errorCode?.startsWith('110200') ? 'This website address must be authorised in Cloudflare Turnstile.' : 'Human verification could not load. Check your connection and retry.'}</span>
          <button type="button" onClick={() => {
            setStatus('loading');
            setErrorCode('');
            if (widgetRef.current !== null && window.turnstile) window.turnstile.reset(widgetRef.current);
            else setRetryKey(value => value + 1);
          }} className="border border-red-300/25 px-2 py-1 text-red-100 hover:bg-red-300/10">Retry</button>
        </div>
      )}
      {status === 'expired' && <p role="status" className="mt-2 text-xs text-yellow-200">Verification expired. Complete it again.</p>}
    </div>
  );
}
