import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, CheckCheck, Download, File, Image, Loader2, MessageCircle, Mic,
  Paperclip, Reply, Search, Send, Smile, Users, Video, X,
} from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import { useAuth } from '@/lib/AuthContext';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const MAX_FILE_BYTES = 75 * 1024 * 1024;
const attachmentIcon = type => type?.startsWith('image') ? Image : type?.startsWith('video') ? Video : type?.startsWith('audio') ? Mic : File;
const formatBytes = bytes => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
const initials = name => String(name || '?').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const lastSeen = person => {
  if (person?.online) return 'online now';
  if (!person?.lastSeenAt) return 'messages are securely stored';
  const when = new Date(person.lastSeenAt);
  return Number.isNaN(when.getTime()) ? 'offline' : `last seen ${when.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`;
};

function AttachmentPreview({ attachment, compact = false, onOpen }) {
  if (!attachment?.url) return null;
  const { url, name, type, bytes } = attachment;
  if (type?.startsWith('image/')) return (
    <button type="button" onClick={() => onOpen?.(attachment)} className="mt-2 block overflow-hidden border border-brass/15 bg-obsidian text-left">
      <img src={url} alt={name || 'Shared image'} className={`${compact ? 'max-h-40' : 'max-h-72'} w-full object-contain`} />
      {name && <span className="block truncate px-3 py-2 text-xs text-ivory/60">{name}</span>}
    </button>
  );
  if (type?.startsWith('video/')) return (
    <div className="mt-2 overflow-hidden border border-brass/15 bg-black">
      <video src={url} controls preload="metadata" playsInline className={`${compact ? 'max-h-40' : 'max-h-72'} w-full`} />
      <p className="flex justify-between gap-3 px-3 py-2 text-xs text-ivory/60"><span className="truncate">{name || 'Video'}</span><span>{formatBytes(bytes)}</span></p>
    </div>
  );
  if (type?.startsWith('audio/')) return (
    <div className="mt-2 min-w-[230px] border border-brass/15 bg-obsidian p-3">
      <p className="mb-2 flex items-center gap-2 truncate text-xs text-brass"><Mic size={15} />{name || 'Voice message'}</p>
      <audio src={url} controls preload="metadata" className="h-9 w-full" />
    </div>
  );
  const Icon = attachmentIcon(type);
  return (
    <button type="button" onClick={() => onOpen?.(attachment)} className="mt-2 flex w-full min-w-[220px] items-center gap-3 border border-brass/15 bg-obsidian p-3 text-left text-xs text-brass">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-brass/10"><Icon size={19} /></span>
      <span className="min-w-0 flex-1"><b className="block truncate font-medium">{name || 'Open attachment'}</b><small className="text-ivory/35">{type?.includes('pdf') ? 'PDF document' : 'Shared file'} {formatBytes(bytes) && `· ${formatBytes(bytes)}`}</small></span>
      <Download size={16} />
    </button>
  );
}

function PreviewOverlay({ attachment, onClose }) {
  if (!attachment) return null;
  const isPdf = attachment.type?.includes('pdf');
  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/90 p-3 backdrop-blur-md sm:p-8" role="dialog" aria-modal="true" aria-label="Attachment preview">
      <div className="flex h-full max-h-[900px] w-full max-w-5xl flex-col border border-brass/25 bg-obsidian shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-brass/15 p-3 sm:p-4">
          <div className="min-w-0"><p className="truncate text-sm text-ivory">{attachment.name || 'Attachment preview'}</p><p className="text-xs text-ivory/35">{formatBytes(attachment.bytes)}</p></div>
          <div className="flex gap-2"><a href={attachment.url} target="_blank" rel="noreferrer" download className="flex h-10 items-center gap-2 border border-brass/20 px-3 text-xs text-brass"><Download size={15} /><span className="hidden sm:inline">Open or download</span></a><button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center border border-brass/20 text-ivory"><X size={18} /></button></div>
        </header>
        <div className="min-h-0 flex-1 bg-black/40 p-2 sm:p-4">
          {attachment.type?.startsWith('image/') && <img src={attachment.url} alt={attachment.name || 'Shared image'} className="h-full w-full object-contain" />}
          {isPdf && <iframe src={attachment.url} title={attachment.name || 'PDF preview'} className="h-full w-full bg-white" />}
          {!attachment.type?.startsWith('image/') && !isPdf && <div className="flex h-full items-center justify-center"><AttachmentPreview attachment={attachment} /></div>}
        </div>
      </div>
    </div>
  );
}

export default function ChatWorkspace({ adminMode = false }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState('');
  const [preview, setPreview] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

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
    window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
  };

  useEffect(() => {
    load().catch(loadError => setError(loadError.message));
    studioClient.chat.heartbeat().catch(() => {});
    const timer = window.setInterval(() => {
      load().catch(() => {});
      studioClient.chat.heartbeat().catch(() => {});
      if (activeId) loadMessages(activeId).catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeId]);
  useEffect(() => { loadMessages(activeId).catch(loadError => setError(loadError.message)); }, [activeId]);
  useEffect(() => {
    if (!file) { setFilePreview(''); return undefined; }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const active = conversations.find(conversation => conversation.id === activeId);
  const other = active?.participants?.find(person => person.id !== user.id);
  const matchingConversations = useMemo(() => conversations.filter(conversation => {
    const person = conversation.participants?.find(entry => entry.id !== user.id);
    return `${person?.name || ''} ${conversation.lastMessage || ''}`.toLowerCase().includes(query.toLowerCase());
  }), [conversations, query, user.id]);
  const existingIds = new Set(conversations.flatMap(conversation => conversation.participantIds || []));
  const matchingPeople = useMemo(() => directory.filter(person => !existingIds.has(person.id) && `${person.name} ${person.role}`.toLowerCase().includes(query.toLowerCase())), [directory, conversations, query]);

  const start = async person => {
    setError('');
    try {
      const conversation = await studioClient.chat.start(person.id);
      await load();
      setActiveId(conversation.id);
    } catch (startError) { setError(startError.message); }
  };
  const chooseFile = selected => {
    setError('');
    if (!selected) return;
    if (selected.size > MAX_FILE_BYTES) return setError('Choose a file no larger than 75 MB.');
    setFile(selected);
  };
  const send = async () => {
    if ((!text.trim() && !file) || !activeId) return;
    setBusy(true);
    setError('');
    try {
      let attachment = {};
      if (file) {
        const uploaded = await studioClient.integrations.Core.UploadFile({ file, purpose: 'chat-attachment' });
        attachment = {
          attachmentUrl: uploaded.file_url,
          attachmentName: file.name,
          attachmentType: file.name.startsWith('voice-message-') ? 'audio/webm' : uploaded.media?.mime || file.type,
          attachmentBytes: file.size,
        };
      }
      await studioClient.chat.send(activeId, { body: text.trim(), ...attachment, replyToId: replyingTo?.id || null, allowForward: false });
      setText(''); setFile(null); setReplyingTo(null);
      await loadMessages(activeId); await load();
    } catch (sendError) { setError(sendError.message); }
    finally { setBusy(false); }
  };
  const setForwarding = async message => { await studioClient.chat.setForwarding(message.id, !message.allowForward); await loadMessages(activeId); };
  const react = async (message, emoji) => { await studioClient.chat.react(message.id, message.reactions?.[user.id] === emoji ? '' : emoji); await loadMessages(activeId); };
  const toggleRecording = async () => {
    setError('');
    if (recording) { recorderRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        setFile(new window.File([blob], `voice-message-${Date.now()}.webm`, { type }));
        stream.getTracks().forEach(track => track.stop());
        setRecording(false);
      };
      recorderRef.current = recorder;
      recorder.start(); setRecording(true);
    } catch { setError('Microphone access was not granted. You can still attach an audio file.'); }
  };

  return (
    <>
      <div className="grid min-h-[620px] max-h-[calc(100dvh-8rem)] overflow-hidden border border-brass/15 bg-carbon lg:grid-cols-[330px_1fr]">
        <aside className={`${activeId ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col border-r border-brass/15`}>
          <div className="border-b border-brass/15 p-4">
            <h2 className="font-display text-2xl text-ivory">{adminMode ? 'Studio conversations' : 'Messages'}</h2>
            <p className="mt-1 text-xs text-ivory/35">Private conversations with signed-in members</p>
            <label className="mt-4 flex h-11 items-center gap-2 border border-brass/15 bg-obsidian px-3 text-ivory/55"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search people or chats" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
          </div>
          {error && <p role="alert" className="border-b border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">{error}</p>}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {matchingConversations.map(conversation => {
              const person = conversation.participants?.find(entry => entry.id !== user.id);
              return <button key={conversation.id} onClick={() => setActiveId(conversation.id)} className={`flex w-full items-center gap-3 border-b border-brass/10 p-4 text-left ${activeId === conversation.id ? 'bg-brass/10' : 'hover:bg-ivory/[0.03]'}`}>
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brass/10 text-xs font-semibold text-brass">{initials(person?.name)}{person?.online && <i className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-carbon bg-green-400" />}</span>
                <span className="min-w-0 flex-1"><b className="block truncate text-sm text-ivory">{person?.name || 'Studio conversation'}</b><small className="block truncate text-ivory/35">{conversation.lastMessage || 'Conversation started'}</small></span>
                {conversation.unread > 0 && <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-green-500 px-1 text-xs text-white">{conversation.unread}</span>}
              </button>;
            })}
            <div className="border-t border-brass/15 p-4">
              <p className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-brass"><Users size={13} />Signed-in people</p>
              {matchingPeople.map(person => <button key={person.id} onClick={() => start(person)} className="flex min-h-12 w-full items-center gap-3 border-b border-brass/10 text-left text-sm text-ivory/60 hover:text-ivory"><span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ivory/5 text-[10px] text-brass">{initials(person.name)}{person.online && <i className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-carbon bg-green-400" />}</span><span className="min-w-0 flex-1 truncate">{person.name}</span><small className="text-brass/60">{person.role === 'customer' ? 'member' : person.role}</small></button>)}
              {!matchingPeople.length && !matchingConversations.length && <p className="py-6 text-center text-xs text-ivory/35">No people match your search.</p>}
            </div>
          </div>
        </aside>

        <section className={`${!activeId ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-col`}>
          {active ? <>
            <header className="flex items-center gap-3 border-b border-brass/15 p-3 sm:p-4">
              <button onClick={() => setActiveId('')} className="flex h-10 w-10 items-center justify-center text-brass lg:hidden" aria-label="Back to conversations"><ArrowLeft size={19} /></button>
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass/10 text-xs font-semibold text-brass">{initials(other?.name)}{other?.online && <i className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-carbon bg-green-400" />}</span>
              <div className="min-w-0"><p className="truncate font-display text-xl text-ivory">{other?.name || 'Studio conversation'}</p><p className={`truncate text-xs ${other?.online ? 'text-green-400' : 'text-ivory/35'}`}>{lastSeen(other)}</p></div>
            </header>
            {error && <p role="alert" className="border-b border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">{error}</p>}
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-obsidian/35 p-3 sm:p-6">
              {messages.map(message => {
                const mine = message.senderId === user.id;
                const attachment = message.attachmentUrl ? { url: message.attachmentUrl, name: message.attachmentName, type: message.attachmentType, bytes: message.attachmentBytes } : null;
                const groupedReactions = Object.values(message.reactions || {}).reduce((result, emoji) => ({ ...result, [emoji]: (result[emoji] || 0) + 1 }), {});
                return <div key={message.id} className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}><article className={`relative max-w-[90%] border p-3 sm:max-w-[72%] ${mine ? 'border-brass/20 bg-brass/10' : 'border-ivory/10 bg-carbon'}`}>
                  {message.replyPreview && <div className="mb-2 border-l-2 border-brass/50 bg-black/20 px-3 py-2 text-xs text-ivory/45"><Reply size={12} className="mb-1 inline text-brass" /> {message.replyPreview}</div>}
                  {message.body && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ivory/75">{message.body}</p>}
                  <AttachmentPreview attachment={attachment} onOpen={setPreview} />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1"><button type="button" onClick={() => setReplyingTo(message)} title="Reply" className="flex h-7 w-7 items-center justify-center text-ivory/30 hover:text-brass"><Reply size={13} /></button><span className="relative flex items-center gap-0.5"><Smile size={13} className="text-ivory/25" />{REACTIONS.map(emoji => <button type="button" key={emoji} onClick={() => react(message, emoji)} className={`hidden px-0.5 text-sm group-hover:inline ${message.reactions?.[user.id] === emoji ? 'inline bg-brass/10' : ''}`}>{emoji}</button>)}</span></div>
                    <div className="flex items-center gap-1 text-[10px] text-ivory/30">{new Date(message.created_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{mine && <CheckCheck size={13} aria-label={message.readAt ? 'Read' : 'Delivered'} className={message.readAt ? 'text-sky-400' : 'text-ivory/35'} />}</div>
                  </div>
                  {Object.keys(groupedReactions).length > 0 && <div className="absolute -bottom-3 right-2 rounded-full border border-brass/15 bg-carbon px-2 py-0.5 text-xs shadow-lg">{Object.entries(groupedReactions).map(([emoji, count]) => <span key={emoji} className="mr-1">{emoji}{count > 1 ? count : ''}</span>)}</div>}
                  {adminMode && attachment && <button type="button" onClick={() => setForwarding(message)} className="mt-3 block text-[10px] uppercase tracking-wider text-brass/70 hover:text-brass">{message.allowForward ? 'Forwarding allowed' : 'Allow customer forwarding'}</button>}
                </article></div>;
              })}
              {!messages.length && <div className="py-16 text-center"><MessageCircle className="mx-auto text-brass/40" /><p className="mt-3 text-sm text-ivory/35">Start the conversation. Messages and files stay with this account.</p></div>}
              <div ref={endRef} />
            </div>
            <footer className="border-t border-brass/15 bg-carbon p-3">
              {replyingTo && <div className="mb-2 flex items-center gap-3 border-l-2 border-brass bg-obsidian px-3 py-2"><Reply size={14} className="text-brass" /><p className="min-w-0 flex-1 truncate text-xs text-ivory/50">Replying to: {replyingTo.body || replyingTo.attachmentName || 'Attachment'}</p><button type="button" onClick={() => setReplyingTo(null)}><X size={15} /></button></div>}
              {file && <div className="mb-2 flex items-start gap-3 border border-brass/15 bg-obsidian p-2"><div className="max-w-[240px] flex-1"><AttachmentPreview compact attachment={{ url: filePreview, name: file.name, type: file.type, bytes: file.size }} /></div><button type="button" onClick={() => setFile(null)} className="flex h-8 w-8 items-center justify-center text-ivory/50"><X size={16} /></button></div>}
              <div className="flex items-end gap-2">
                <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border border-brass/20 text-brass" title="Attach image, video, audio or document"><Paperclip size={17} /><input type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.docx,.xlsx,.pptx,.zip" onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
                <button type="button" onClick={toggleRecording} title={recording ? 'Stop recording' : 'Record voice message'} className={`flex h-11 w-11 shrink-0 items-center justify-center border ${recording ? 'animate-pulse border-red-400 bg-red-400/10 text-red-300' : 'border-brass/20 text-brass'}`}><Mic size={17} /></button>
                <textarea value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} rows={2} placeholder="Write a message…" className="min-w-0 flex-1 resize-none border border-brass/20 bg-obsidian p-3 text-sm text-ivory outline-none" />
                <button disabled={busy || (!text.trim() && !file)} onClick={send} className="flex h-11 w-11 shrink-0 items-center justify-center bg-brass text-obsidian disabled:opacity-40" aria-label="Send message">{busy ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}</button>
              </div>
              {recording && <p className="mt-2 text-xs text-red-300">Recording voice message… press the microphone again to stop.</p>}
            </footer>
          </> : <div className="m-auto p-8 text-center"><MessageCircle className="mx-auto text-brass" size={34} /><p className="mt-4 font-display text-2xl text-ivory">Choose a conversation</p><p className="mt-2 text-sm text-ivory/40">Search signed-in people or continue an existing chat.</p></div>}
        </section>
      </div>
      <PreviewOverlay attachment={preview} onClose={() => setPreview(null)} />
    </>
  );
}
