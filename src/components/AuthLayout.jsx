export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-obsidian px-4 py-28 relative overflow-hidden">
      <div className="absolute inset-0 gradient-radial-violet opacity-40" />
      <div className="noise-overlay absolute inset-0" />
      <div className="w-full max-w-md relative">
        <div className="text-center mb-10">
          <a
            href="/"
            className="mx-auto mb-5 block touch-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
            aria-label="Return to Reigns Atelier"
          >
            <img src="/brand/reigns-app-icon-192.png" alt="" className="h-20 w-20 rounded-full border border-brass/25 object-cover" draggable="false" />
          </a>
          <div
            className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brass/10"
            aria-hidden="true"
          >
            <Icon className="w-5 h-5 text-brass" />
          </div>
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
