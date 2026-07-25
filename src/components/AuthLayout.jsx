import { useRef } from 'react';

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  const holdTimer = useRef(null);
  const openAdminSignIn = () => window.location.assign('/login?redirect=/admin&mode=admin');
  const startAdminHold = event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(openAdminSignIn, 700);
  };
  const cancelAdminHold = () => {
    window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-obsidian px-4 py-28 relative overflow-hidden">
      <div className="absolute inset-0 gradient-radial-violet opacity-40" />
      <div className="noise-overlay absolute inset-0" />
      <div className="w-full max-w-md relative">
        <div className="text-center mb-10">
          <button
            type="button"
            onClick={openAdminSignIn}
            onPointerDown={startAdminHold}
            onPointerUp={cancelAdminHold}
            onPointerLeave={cancelAdminHold}
            onPointerCancel={cancelAdminHold}
            onContextMenu={event => event.preventDefault()}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') window.location.assign('/login?redirect=/admin&mode=admin');
            }}
            className="mx-auto mb-5 block touch-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
            aria-label="Open administrator sign-in"
            title="Click or press and hold for administrator sign-in"
          >
            <img src="/brand/reigns-app-icon-192.png" alt="" className="h-20 w-20 rounded-full border border-brass/25 object-cover" draggable="false" />
          </button>
          <button
            type="button"
            onClick={openAdminSignIn}
            onPointerDown={startAdminHold}
            onPointerUp={cancelAdminHold}
            onPointerLeave={cancelAdminHold}
            onPointerCancel={cancelAdminHold}
            onContextMenu={event => event.preventDefault()}
            className="mb-4 inline-flex h-10 w-10 touch-none items-center justify-center rounded-full bg-brass/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
            aria-label="Open administrator sign-in from the security icon"
            title="Open administrator sign-in"
          >
            <Icon className="w-5 h-5 text-brass" aria-hidden="true" />
          </button>
          <h1 className="font-display text-4xl text-ivory">{title}</h1>
          {subtitle && <p className="text-ivory/45 mt-2 text-sm">{subtitle}</p>}
        </div>
        <div className="glass-panel border border-brass/15 p-8 shadow-2xl">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-ivory/40 mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
