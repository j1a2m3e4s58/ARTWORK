import { useState } from 'react';
import { Archive, MailOpen, Search, Send, ShieldAlert, Trash2 } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import ResponsiveSelect from '@/components/ResponsiveSelect';

export default function InboxTab({ messages, setMessages }) {
  const [replies, setReplies] = useState({});
  const [workingId, setWorkingId] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('open');
  const visibleMessages = messages.filter(message => {
    const matchesQuery = `${message.name} ${message.email} ${message.subject} ${message.message}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === 'all'
      || (filter === 'open' && !['replied', 'archived', 'spam'].includes(message.status))
      || message.status === filter;
    return matchesQuery && matchesFilter;
  });

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

  const updateStatus = async (message, status) => {
    setWorkingId(message.id);
    setError('');
    try {
      const updated = await studioClient.entities.Message.update(message.id, { status });
      setMessages(items => items.map(item => item.id === message.id ? updated : item));
    } catch (statusError) {
      setError(statusError.message);
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div>
      <h1 className="font-display text-4xl text-ivory mb-2">Message Inbox</h1>
      <p className="text-ivory/40 text-sm mb-8">Read and reply to messages submitted through the contact page.</p>
      {error && <p role="alert" className="mb-4 border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ivory/30" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search messages"
            className="w-full border border-brass/15 bg-carbon py-2.5 pl-9 pr-3 text-sm text-ivory" />
        </label>
        <div className="w-full sm:w-48"><ResponsiveSelect label="Filter messages" value={filter} onChange={setFilter} options={[{ value: 'open', label: 'Needs reply' }, { value: 'all', label: 'All messages' }, 'replied', 'archived', 'spam']} /></div>
      </div>
      <div className="space-y-4">
        {visibleMessages.length === 0 && <p className="border border-brass/10 p-8 text-center text-ivory/30">No messages in this view.</p>}
        {visibleMessages.map(message => (
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
              <div className="flex items-center gap-3">
                <button disabled={workingId === message.id} onClick={() => updateStatus(message, 'read')} aria-label="Mark as read" className="text-ivory/40 hover:text-brass disabled:opacity-40"><MailOpen size={16} /></button>
                <button disabled={workingId === message.id} onClick={() => updateStatus(message, 'archived')} aria-label="Archive message" className="text-ivory/40 hover:text-brass disabled:opacity-40"><Archive size={16} /></button>
                <button disabled={workingId === message.id} onClick={() => updateStatus(message, 'spam')} aria-label="Mark as spam" className="text-ivory/40 hover:text-red-300 disabled:opacity-40"><ShieldAlert size={16} /></button>
                <button disabled={workingId === message.id} onClick={() => remove(message.id)} aria-label="Delete message" className="text-red-400/70 disabled:opacity-40"><Trash2 size={16} /></button>
              </div>
            </div>
            <p className="text-ivory/60 text-sm leading-relaxed my-5 whitespace-pre-wrap">{message.message}</p>
            {(message.replies || (message.reply ? [message.reply] : [])).map(replyItem => (
              <div key={replyItem.id || replyItem.sentAt} className="mb-4 border-l-2 border-brass/40 bg-brass/5 p-3 text-sm text-ivory/60">
                <span className="text-brass text-xs uppercase tracking-wider">Studio reply</span>
                <p className="mt-1">{replyItem.text}</p>
                <p className={`mt-2 text-[10px] ${replyItem.delivery?.delivered ? 'text-green-300' : 'text-yellow-300'}`}>
                  {replyItem.delivery?.delivered ? 'Email delivered' : 'Saved in portal — email delivery pending'}
                </p>
              </div>
            ))}
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
