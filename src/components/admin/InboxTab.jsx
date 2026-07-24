import { useEffect, useState } from 'react';
import { Mail, Send, Trash2 } from 'lucide-react';
import { studioClient } from '@/api/studioClient';

export default function InboxTab() {
  const [messages, setMessages] = useState([]);
  const [replies, setReplies] = useState({});
  useEffect(() => { studioClient.entities.Message.list('-created_date').then(setMessages); }, []);

  const reply = async message => {
    const text = replies[message.id]?.trim();
    if (!text) return;
    const response = { text, sentAt: new Date().toISOString() };
    await studioClient.entities.Message.update(message.id, { status: 'replied', reply: response });
    setMessages(items => items.map(item => item.id === message.id ? { ...item, status: 'replied', reply: response } : item));
    setReplies(current => ({ ...current, [message.id]: '' }));
  };

  const remove = async id => {
    await studioClient.entities.Message.delete(id);
    setMessages(items => items.filter(item => item.id !== id));
  };

  return (
    <div>
      <h1 className="font-display text-4xl text-ivory mb-2">Message Inbox</h1>
      <p className="text-ivory/40 text-sm mb-8">Read and reply to messages submitted through the contact page.</p>
      <div className="space-y-4">
        {messages.length === 0 && <p className="border border-brass/10 p-8 text-center text-ivory/30">No messages yet.</p>}
        {messages.map(message => (
          <article key={message.id} className="border border-brass/10 bg-carbon p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-xl text-ivory">{message.subject || 'Website message'}</p>
                <p className="text-xs text-brass mt-1">{message.name} · {message.email}</p>
              </div>
              <button onClick={() => remove(message.id)} className="text-red-400/70"><Trash2 size={16} /></button>
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
              <button onClick={() => reply(message)} className="bg-brass text-obsidian px-4 flex items-center gap-2"><Send size={15} /> Reply</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
