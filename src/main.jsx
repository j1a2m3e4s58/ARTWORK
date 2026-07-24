import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

const installableEnvironment = import.meta.env.PROD || ['localhost', '127.0.0.1'].includes(window.location.hostname);

if ('serviceWorker' in navigator && installableEnvironment) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      if (registration.waiting) window.dispatchEvent(new CustomEvent('atelier:update-ready', { detail: registration }));
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('atelier:update-ready', { detail: registration }));
          }
        });
      });
    }).catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
