import { useEffect, useRef, useState } from 'react';
import { CheckCheck, File, Image, Loader2, MessageCircle, Mic, Paperclip, Send, Users, Video } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import { useAuth } from '@/lib/AuthContext';

const attachmentIcon = type => type?.startsWith('image') ? Image : type?.startsWith('video') ? Video : type?.startsWith('audio') ? Mic : File;

export default function ChatWorkspace({ adminMode = false }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  const load = async () => {
    const [conversationRows, people] = await Promise.all([studioClient.chat.conversations(), studioClient.chat.directory()]);
    setConversations(conversationRows);
    setDirectory(people);
    if (!activeId && conversationRows[0]) setActiveId(conversationRows[0].id);
  };
  const loadMessages = async id => {
    if (!id) return;
    const rows = await studioClient.chat.messages(id);
    setMessages(rows);
    await studioClient.chat.markRead(id);
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    load();
    studioClient.chat.heartbeat().catch(() => {});
    const timer = window.setInterval(() => {
      load();
      studioClient.chat.heartbeat().catch(() => {});
      if (activeId) loadMessages(activeId);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeId]);
  useEffect(() => { loadMessages(activeId).catch(() => {}); }, [activeId]);

  const start = async person => {
    const conversation = await studioClient.chat.start(person.id);
    await load();
    setActiveId(conversation.id);
  };
  const send = async () => {
    if (!text.trim() && !file) return;
    setBusy(true);
    try {
      let attachment = {};
      if (file) {
        const uploaded = await studioClient.integrations.Core.UploadFile({ file, purpose: 'chat-attachment' });
        attachment = { attachmentUrl: uploaded.file_url, attachmentName: file.name, attachmentType: file.type };
      }
      await studioClient.chat.send(activeId, { body: text, ...attachment, allowForward: false });
      setText('');
      setFile(null);
      await loadMessages(activeId);
      await load();
    } finally {
      setBusy(false);
    }
  };
  const setForwarding = async message => {
    await studioClient.chat.setForwarding(message.id, !message.allowForward);
    await loadMessages(activeId);
  };

  const active = conversations.find(conversation => conversation.id === activeId);
  const other = active?.participants?.find(person => person.id !== user.id);

  return (
    <div className="grid min-h-[620px] overflow-hidden border border-brass/15 bg-carbon lg:grid-cols-[320px_1fr]">
      <aside className={`${activeId ? 'hidden lg:block' : 'block'} border-r border-brass/15`}>
        <div className="border-b border-brass/15 p-4">
          <h2 className="font-display text-2xl text-ivory">{adminMode ? 'Studio conversations' : 'Messages'}</h2>
          <p className="mt-1 text-xs text-ivory/35">Private customer and studio conversations</p>
        </div>
        <div className="max-h-72 overflow-y-auto border-b border-brass/15">
          {conversations.map(conversation => {
            const person = conversation.participants?.find(entry => entry.id !== user.id);
            return (
              <button key={conversation.id} onClick={() => setActiveId(conversation.id)} className={`flex w-full items-center gap-3 border-b border-brass/10 p-4 text-left ${activeId === conversation.id ? 'bg-brass/10' : ''}`}>
                <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-brass/10 text-brass"><MessageCircle size={18} />{person?.online && <i className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-carbon bg-green-400" />}</span>
                <span className="min-w-0 flex-1"><b className="block truncate text-sm text-ivory">{person?.name || 'Studio conversation'}</b><small className="block truncate text-ivory/35">{conversation.lastMessage || 'Conversation started'}</small></span>
                {conversation.unread > 0 && <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-green-500 px-1 text-xs text-white">{conversation.unread}</span>}
              </button>
            );
          })}
        </div>
        <div className="p-4">
          <p className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-brass"><Users size={13} />Start a conversation</p>
          {directory.map(person => <button key={person.id} onClick={() => start(person)} className="flex min-h-11 w-full items-center justify-between border-b border-brass/10 text-left text-sm text-ivory/60"><span>{person.name} <small className="text-brass/60">{person.role === 'customer' ? 'community' : person.role}</small></span>{person.online && <span className="text-xs text-green-400">online</span>}</button>)}
        </div>
      </aside>

      <section className={`${!activeId ? 'hidden lg:flex' : 'flex'} min-w-0 flex-col`}>
        {active ? <>
          <header className="flex items-center gap-3 border-b border-brass/15 p-4">
            <button onClick={() => setActiveId('')} className="text-brass lg:hidden">Back</button>
            <div><p className="font-display text-xl text-ivory">{other?.name || 'Studio conversation'}</p><p className={`text-xs ${other?.online ? 'text-green-400' : 'text-ivory/35'}`}>{other?.online ? 'online now' : 'messages are securely stored'}</p></div>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto bg-obsidian/35 p-4 sm:p-6">
            {messages.map(message => {
              const mine = message.senderId === user.id;
              const Icon = attachmentIcon(message.attachmentType);
              return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><article className={`max-w-[85%] border p-3 sm:max-w-[70%] ${mine ? 'border-brass/20 bg-brass/10' : 'border-ivory/10 bg-carbon'}`}>
                {message.body && <p className="whitespace-pre-wrap text-sm leading-6 text-ivory/75">{message.body}</p>}
                {message.attachmentUrl && <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 border border-brass/15 p-2 text-xs text-brass"><Icon size={16} />{message.attachmentName || 'Open attachment'}</a>}
                {adminMode && message.attachmentUrl && <button type="button" onClick={() => setForwarding(message)} className="mt-2 text-[10px] uppercase tracking-wider text-brass/70 hover:text-brass">{message.allowForward ? 'Forwarding allowed' : 'Allow customer forwarding'}</button>}
                <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-ivory/30">{new Date(message.created_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{mine && <CheckCheck size={13} className={message.readAt ? 'text-sky-400' : 'text-ivory/35'} />}</div>
              </article></div>;
            })}
            <div ref={endRef} />
          </div>
          <footer className="border-t border-brass/15 p-3">
            <div className="flex items-end gap-2">
              <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border border-brass/20 text-brass"><Paperclip size={17} /><input type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx" onChange={event => setFile(event.target.files?.[0] || null)} /></label>
              <textarea value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} rows={2} placeholder="Write a message…" className="min-w-0 flex-1 resize-none border border-brass/20 bg-obsidian p-3 text-sm text-ivory outline-none" />
              <button disabled={busy} onClick={send} className="flex h-11 w-11 shrink-0 items-center justify-center bg-brass text-obsidian">{busy ? <Loader2 className="animate-spin" /> : <Send size={17} />}</button>
            </div>
            {file && <p className="mt-2 truncate text-xs text-brass">Attached: {file.name}</p>}
          </footer>
        </> : <div className="m-auto p-8 text-center"><MessageCircle className="mx-auto text-brass" size={34} /><p className="mt-4 font-display text-2xl text-ivory">Choose a conversation</p><p className="mt-2 text-sm text-ivory/40">Start with the studio or an opted-in community member.</p></div>}
      </section>
    </div>
  );
}
