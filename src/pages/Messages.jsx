import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageTransition from '@/components/PageTransition';
import ChatWorkspace from '@/components/chat/ChatWorkspace';
import { useAuth } from '@/lib/AuthContext';
export default function Messages() {
  const { user } = useAuth();

  useEffect(() => {
    const previous = {
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
      overscroll: document.body.style.overscrollBehavior,
    };
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    const syncViewportHeight = () => {
      const height = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty('--messages-viewport-height', `${Math.round(height)}px`);
    };
    syncViewportHeight();
    window.visualViewport?.addEventListener('resize', syncViewportHeight);
    window.visualViewport?.addEventListener('scroll', syncViewportHeight);
    window.addEventListener('orientationchange', syncViewportHeight);
    return () => {
      window.visualViewport?.removeEventListener('resize', syncViewportHeight);
      window.visualViewport?.removeEventListener('scroll', syncViewportHeight);
      window.removeEventListener('orientationchange', syncViewportHeight);
      document.documentElement.style.removeProperty('--messages-viewport-height');
      document.documentElement.style.overflow = previous.htmlOverflow;
      document.body.style.overflow = previous.bodyOverflow;
      document.body.style.overscrollBehavior = previous.overscroll;
    };
  }, []);

  return <PageTransition><main className="messages-page h-[var(--messages-viewport-height,100dvh)] max-h-[var(--messages-viewport-height,100dvh)] overflow-hidden overscroll-none bg-obsidian"><div className="h-full min-h-0 w-full overflow-hidden">{user ? <ChatWorkspace /> : <section className="mx-auto mt-10 max-w-xl border border-brass/20 bg-carbon p-8 text-center"><h1 className="font-display text-4xl text-ivory">Studio Messages</h1><p className="mt-3 text-ivory/50">Sign in to privately message the atelier.</p><Link to="/login?redirect=/messages" className="mt-5 inline-flex bg-brass px-5 py-3 text-xs text-obsidian">Sign in</Link></section>}</div></main></PageTransition>;
}
