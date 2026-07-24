import React from "react";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-obsidian px-4 py-28 relative overflow-hidden">
      <div className="absolute inset-0 gradient-radial-violet opacity-40" />
      <div className="noise-overlay absolute inset-0" />
      <div className="w-full max-w-md relative">
        <div className="text-center mb-10">
          <img src="/brand/reigns-app-icon-192.png" alt="Reigns Atelier" className="mx-auto mb-5 h-20 w-20 rounded-full border border-brass/25 object-cover" />
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-brass/10 mb-4">
            <Icon className="w-5 h-5 text-brass" aria-hidden="true" />
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
