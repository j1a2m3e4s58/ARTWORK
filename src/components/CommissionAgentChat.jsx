import { useState } from 'react';
import { MessageCircle, X, Send, Loader2, Sparkles } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/lib/AuthContext';

export default function CommissionAgentChat() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const startConversation = async () => {
    if (conversation) return;
    try {
      const conv = await studioClient.agents.createConversation({
        agent_name: 'commission_assistant',
        metadata: { name: 'Commission Chat' },
      });
      setConversation(conv);
      // Subscribe to updates
      setMessages([{
        role: 'assistant',
        content: 'Welcome to the commission studio. Tell me what you would like to create, and I’ll help shape the idea, budget, and timeline.',
      }]);
    } catch (e) {
      setMessages([{ role: 'assistant', content: '⚠️ The AI assistant requires a Builder+ plan to activate. Please upgrade to enable live AI commission help.' }]);
    }
  };

  const handleOpen = () => {
    if (!user) {
      window.location.assign('/login?redirect=/commission');
      return;
    }
    setOpen(true);
    if (!conversation) startConversation();
  };

  const handleSend = async () => {
    if (!input.trim() || !conversation || loading) return;
    const text = input.trim();
    setInput('');
    setLoading(true);
    try {
      setMessages(current => [...current, { role: 'user', content: text }]);
      const reply = await studioClient.agents.addMessage(conversation, { role: 'user', content: text });
      setMessages(current => [...current, reply]);
    } catch (e) {
      // ignore
    }
    setLoading(false);
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-24 right-[4.75rem] z-30 flex h-12 w-12 items-center justify-center rounded-full bg-brass text-obsidian shadow-lg shadow-brass/20 transition-all hover:scale-105 hover:bg-brass-light md:bottom-40 md:right-8 md:h-12 md:w-12"
        aria-label="AI Commission Assistant"
      >
        <MessageCircle size={20} />
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-4 z-[9000] flex h-[500px] max-h-[calc(100dvh-8rem)] w-[360px] max-w-[calc(100vw-2rem)] flex-col border border-brass/30 glass-panel md:bottom-24 md:right-8">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-brass/15">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-brass/15 flex items-center justify-center rounded-full">
                <Sparkles size={16} className="text-brass" />
              </div>
              <div>
                <p className="font-display text-sm text-ivory">Commission Assistant</p>
                <p className="text-ivory/40 text-[10px] font-tight">AI-powered · Always here</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-ivory/30 hover:text-brass transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <Loader2 size={20} className="text-brass/50 animate-spin mx-auto mb-3" />
                <p className="text-ivory/40 text-sm font-tight">Starting conversation...</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-3 py-2 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-brass text-obsidian rounded-l-xl rounded-tr-xl'
                    : 'bg-carbon text-ivory/80 border border-brass/10 rounded-r-xl rounded-tl-xl'
                }`}>
                  {msg.role === 'assistant'
                    ? <ReactMarkdown className="prose prose-sm prose-invert max-w-none text-sm">{msg.content}</ReactMarkdown>
                    : msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-carbon border border-brass/10 px-3 py-2 rounded-r-xl rounded-tl-xl">
                  <Loader2 size={14} className="text-brass/50 animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-brass/15 flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Describe your vision..."
              className="flex-1 bg-obsidian border border-brass/20 text-ivory/80 px-3 py-2 text-sm placeholder:text-ivory/25 focus:outline-none focus:border-brass/40 transition-colors"
            />
            <button onClick={handleSend} disabled={!input.trim() || loading || !conversation}
              className="bg-brass text-obsidian px-3 py-2 hover:bg-brass-light transition-all disabled:opacity-30">
              <Send size={16} />
            </button>
          </div>

        </div>
      )}
    </>
  );
}
