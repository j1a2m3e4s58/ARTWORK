import { FaGoogle } from 'react-icons/fa';

const providerLabels = {
  google: 'Continue with Google',
};

export default function SocialAuthButtons() {
  const continueWith = provider => {
    const returnTo = new URLSearchParams(window.location.search).get('redirect') || '/account?oauth=success';
    window.location.assign(`/api/auth/oauth/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`);
  };

  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-ivory/35" aria-hidden="true">
        <span className="h-px flex-1 bg-brass/15" /> Or continue with <span className="h-px flex-1 bg-brass/15" />
      </div>
      {['google'].map(provider => {
        const Icon = FaGoogle;
        return (
          <button key={provider} type="button" onClick={() => continueWith(provider)}
            className="flex w-full items-center justify-center gap-2 border border-brass/25 bg-obsidian/40 py-3 text-sm text-ivory transition-colors hover:border-brass/60 hover:bg-brass/10">
            <Icon aria-hidden="true" size={16} className={provider === 'google' ? 'text-[#dca645]' : 'text-ivory'} />
            {providerLabels[provider]}
          </button>
        );
      })}
      <p className="text-center text-xs leading-5 text-ivory/40">Google sign-in is available once the studio connects the provider.</p>
    </div>
  );
}
