import { Link } from 'react-router-dom';
import PageTransition from '@/components/PageTransition';
import ChatWorkspace from '@/components/chat/ChatWorkspace';
import { useAuth } from '@/lib/AuthContext';
export default function Messages(){const {user}=useAuth();return <PageTransition><main className="h-[100dvh] overflow-hidden bg-obsidian px-2 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-[5.35rem] sm:px-4 sm:pb-4 sm:pt-24 lg:px-6"><div className="mx-auto h-full w-full max-w-[1600px]">{user?<ChatWorkspace/>:<section className="border border-brass/20 bg-carbon p-8 text-center"><h1 className="font-display text-4xl text-ivory">Studio Messages</h1><p className="mt-3 text-ivory/50">Sign in to privately message the atelier.</p><Link to="/login?redirect=/messages" className="mt-5 inline-flex bg-brass px-5 py-3 text-xs text-obsidian">Sign in</Link></section>}</div></main></PageTransition>}
