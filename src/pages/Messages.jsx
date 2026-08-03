import { Link } from 'react-router-dom';
import PageTransition from '@/components/PageTransition';
import ChatWorkspace from '@/components/chat/ChatWorkspace';
import { useAuth } from '@/lib/AuthContext';
export default function Messages(){const {user}=useAuth();return <PageTransition><main className="h-full overflow-hidden bg-obsidian px-2 pb-28 pt-24 sm:px-5 sm:pt-28 lg:px-6 lg:pb-8"><div className="mx-auto w-full max-w-7xl">{user?<ChatWorkspace/>:<section className="border border-brass/20 bg-carbon p-8 text-center"><h1 className="font-display text-4xl text-ivory">Studio Messages</h1><p className="mt-3 text-ivory/50">Sign in to privately message the atelier.</p><Link to="/login?redirect=/messages" className="mt-5 inline-flex bg-brass px-5 py-3 text-xs text-obsidian">Sign in</Link></section>}</div></main></PageTransition>}
