import { useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { studioClient } from '@/api/studioClient';

export default function InboxTab({ messages, setMessages }) {
  const [replies, setReplies] = useState({});
  const [workingId, setWorkingId] = useState(null);
  const [error, setError] = useState('');

  const reply = async message => {
    const text = replies[message.id]?.trim();
    if (!text) return;
    setWorkingId(message.id);
    setError('');
    try {
      const updated = await studioClient.messages.reply(message.id, text);
      setMessages(items => items.map(item => item.id === message.id ? updated : item));
      setReplies(current => ({ ...current, [message.id]: '' }));
    } catch (replyError) {
      setError(replyError.message || 'The reply could not be sent.');
    } finally {
      setWorkingId(null);
    }
  };

  const remove = async id => {
    setWorkingId(id);
    setError('');
    try {
      await studioClient.entities.Message.delete(id);
      setMessages(items => items.filter(item => item.id !== id));
    } catch (deleteError) {
      setError(deleteError.message || 'The message could not be deleted.');
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div>
      <h1 className="font-display text-4xl text-ivory mb-2">Message Inbox</h1>
      <p className="text-ivory/40 text-sm mb-8">Read and reply to messages submitted through the contact page.</p>
      {error && <p role="alert" className="mb-4 border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
      <div className="space-y-4">
        {messages.length === 0 && <p className="border border-brass/10 p-8 text-center text-ivory/30">No messages yet.</p>}
        {messages.map(message => (
          <article key={message.id} className={`border bg-carbon p-5 ${message.status === 'replied' ? 'border-brass/10' : 'border-brass/40'}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-xl text-ivory">{message.subject || 'Website message'}</p>
                  {message.status !== 'replied' && (
                    <span className="rounded-full bg-brass/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-brass">Needs reply</span>
                  )}
                </div>
                <p className="text-xs text-brass mt-1">{message.name} · {message.email}</p>
              </div>
              <button disabled={workingId === message.id} onClick={() => remove(message.id)} aria-label="Delete message" className="text-red-400/70 disabled:opacity-40"><Trash2 size={16} /></button>
            </div>
            <p className="text-ivory/60 text-sm leading-relaxed my-5 whitespace-pre-wrap">{message.message}</p>
            {message.reply && (
              <div className="mb-4 border-l-2 border-brass/40 bg-brass/5 p-3 text-sm text-ivory/60">
                <span className="text-brass text-xs uppercase tracking-wider">Your reply</span>
                <p className="mt-1">{message.reply.text}</p>
              </div>
            )}
            <div className="flex gap-2">
              <textarea value={replies[message.id] || ''} onChange={e => setReplies({ ...replies, [message.id]: e.target.value })}
                placeholder="Write a reply..." rows={2}
                className="flex-1 bg-obsidian border border-brass/20 px-3 py-2 text-sm text-ivory resize-none" />
              <button disabled={workingId === message.id || !replies[message.id]?.trim()} onClick={() => reply(message)}
                className="bg-brass text-obsidian px-4 flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40">
                <Send size={15} /> {workingId === message.id ? 'Sending…' : 'Reply'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
