import { usePageContent } from '@/hooks/usePageContent';
import PageTransition from '@/components/PageTransition';

export default function LegalPage({ type }) {
  const page = usePageContent('Legal');
  const privacy = type === 'privacy';
  const title = privacy ? (page.privacy_title || 'Privacy Policy') : (page.terms_title || 'Terms of Service');
  const body = privacy
    ? (page.privacy_body || 'We collect account, message, and commission information only to provide studio services. We do not sell personal information.')
    : (page.terms_body || 'By using Reigns Atelier, you agree to provide accurate information and respect the artist’s intellectual property and commission terms.');
  return (
    <PageTransition>
      <main className="min-h-screen bg-obsidian px-6 pb-24 pt-32">
        <article className="mx-auto max-w-3xl">
          <p className="mb-3 text-xs uppercase tracking-[.3em] text-brass/60">Reigns Atelier</p>
          <h1 className="font-display text-5xl text-ivory">{title}</h1>
          <div className="mt-10 whitespace-pre-wrap border-t border-brass/10 pt-8 text-sm leading-8 text-ivory/60">{body}</div>
        </article>
      </main>
    </PageTransition>
  );
}
