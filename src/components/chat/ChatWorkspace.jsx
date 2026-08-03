import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, ArrowLeft, Ban, Bell, BellOff, CheckCheck, Download, File, Image, Loader2,
  Megaphone, MessageCircle, Mic, MoreVertical, Paperclip, Pencil, Reply, RotateCcw,
  Search, Send, Smile, Square, Trash2, Users, Video, X,
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
const conversationName = (conversation, currentUserId) => conversation?.title
  || conversation?.participants?.find(person => person.id !== currentUserId)?.name
  || 'Studio conversation';
const urlBase64ToUint8Array = value => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = window.atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(character => character.charCodeAt(0)));
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
  const [messageQuery, setMessageQuery] = useState('');
  const [searchingMessages, setSearchingMessages] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showConversationMenu, setShowConversationMenu] = useState(false);
  const [editing, setEditing] = useState(null);
  const [messageMenuId, setMessageMenuId] = useState('');
  const [reactionPickerId, setReactionPickerId] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [pushState, setPushState] = useState('unknown');
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [announcement, setAnnouncement] = useState({ title: 'Studio announcements', body: '' });
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const messagesPaneRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const uploadAbortRef = useRef(null);
  const typingTimerRef = useRef(null);

  const load = async () => {
    const [conversationRows, people] = await Promise.all([studioClient.chat.conversations(), studioClient.chat.directory()]);
    setConversations(conversationRows);
    setDirectory(people);
    if (!activeId && conversationRows[0]) {
      const requestedId = new URLSearchParams(window.location.search).get('conversation');
      setActiveId(conversationRows.some(row => row.id === requestedId) ? requestedId : conversationRows[0].id);
    }
  };
  const loadMessages = async (id, search = messageQuery, options = {}) => {
    if (!id) return;
    const pane = messagesPaneRef.current;
    const distanceFromBottom = pane
      ? pane.scrollHeight - pane.scrollTop - pane.clientHeight
      : Number.POSITIVE_INFINITY;
    const shouldFollowLatest = options.scrollToBottom || distanceFromBottom < 120;
    const rows = await studioClient.chat.messages(id, search);
    setMessages(rows);
    const hasUnreadIncoming = rows.some(message => message.senderId !== user.id && !(message.readBy || []).includes(user.id));
    if (hasUnreadIncoming) await studioClient.chat.markRead(id);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const currentPane = messagesPaneRef.current;
      if (!currentPane) return;
      if (options.scrollToTop) currentPane.scrollTop = 0;
      else if (shouldFollowLatest) currentPane.scrollTop = currentPane.scrollHeight;
    }));
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
  useEffect(() => {
    setMessageQuery('');
    setSearchingMessages(false);
    loadMessages(activeId, '', { scrollToBottom: true }).catch(loadError => setError(loadError.message));
  }, [activeId]);
  useEffect(() => {
    if (!file) { setFilePreview(''); return undefined; }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!('Notification' in window)) setPushState('unsupported');
    else setPushState(window.Notification.permission === 'granted' ? 'enabled' : 'disabled');
    return () => {
      window.clearTimeout(typingTimerRef.current);
      uploadAbortRef.current?.abort();
    };
  }, []);

  const active = conversations.find(conversation => conversation.id === activeId);
  const other = active?.participants?.find(person => person.id !== user.id);
  const matchingConversations = useMemo(() => conversations.filter(conversation => {
    if (Boolean(conversation.archived) !== showArchived) return false;
    return `${conversationName(conversation, user.id)} ${conversation.lastMessage || ''}`.toLowerCase().includes(query.toLowerCase());
  }), [conversations, query, showArchived, user.id]);
  const existingIds = new Set(conversations.filter(conversation => conversation.type !== 'announcement').flatMap(conversation => conversation.participantIds || []));
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
    setUploadFailed(false);
    setUploadProgress(file ? 1 : 0);
    setError('');
    try {
      let attachment = {};
      if (file) {
        uploadAbortRef.current = new AbortController();
        const uploaded = await studioClient.integrations.Core.UploadFileProgress({
          file, purpose: 'chat-attachment', signal: uploadAbortRef.current.signal, onProgress: setUploadProgress,
        });
        attachment = {
          attachmentUrl: uploaded.file_url,
          attachmentName: file.name,
          attachmentType: file.name.startsWith('voice-message-') ? 'audio/webm' : uploaded.media?.mime || file.type,
          attachmentBytes: file.size,
        };
      }
      await studioClient.chat.send(activeId, { body: text.trim(), ...attachment, replyToId: replyingTo?.id || null, allowForward: false });
      setText(''); setFile(null); setReplyingTo(null);
      setUploadProgress(0);
      await loadMessages(activeId, '', { scrollToBottom: true }); await load();
    } catch (sendError) {
      setUploadFailed(Boolean(file) && sendError.name !== 'AbortError');
      setError(sendError.name === 'AbortError' ? 'Upload cancelled. Your file is still ready to retry.' : sendError.message);
    } finally { setBusy(false); uploadAbortRef.current = null; }
  };
  const setForwarding = async message => { await studioClient.chat.setForwarding(message.id, !message.allowForward); await loadMessages(activeId); };
  const react = async (message, emoji) => { await studioClient.chat.react(message.id, message.reactions?.[user.id] === emoji ? '' : emoji); await loadMessages(activeId); };
  const saveEdit = async () => {
    if (!editing?.body?.trim()) return;
    setBusy(true);
    try { await studioClient.chat.edit(editing.id, editing.body); setEditing(null); await loadMessages(activeId); await load(); }
    catch (editError) { setError(editError.message); }
    finally { setBusy(false); }
  };
  const removeMessage = async (message, mode) => {
    try { await studioClient.chat.remove(message.id, mode); await loadMessages(activeId); await load(); }
    catch (removeError) { setError(removeError.message); }
  };
  const updateConversation = async changes => {
    try {
      const updated = await studioClient.chat.settings(activeId, changes);
      setConversations(rows => rows.map(row => row.id === activeId ? updated : row));
      if (changes.archived) setActiveId('');
      setShowConversationMenu(false);
    } catch (settingsError) { setError(settingsError.message); }
  };
  const updateTyping = value => {
    setText(value);
    if (!activeId) return;
    studioClient.chat.typing(activeId, Boolean(value.trim())).catch(() => {});
    window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => studioClient.chat.typing(activeId, false).catch(() => {}), 1800);
  };
  const runMessageSearch = async event => {
    event?.preventDefault();
    setSearchBusy(true);
    try { await loadMessages(activeId, messageQuery, { scrollToTop: true }); }
    catch (searchError) { setError(searchError.message); }
    finally { setSearchBusy(false); }
  };
  const enablePush = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('This browser does not support push notifications.');
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (pushState === 'enabled' && existing) {
        await studioClient.push.unsubscribe(existing.endpoint);
        await existing.unsubscribe();
        setPushState('disabled');
        return;
      }
      const config = await studioClient.push.config();
      if (!config.configured) throw new Error('Add VAPID keys on Render before enabling push notifications.');
      const permission = await window.Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission was not granted.');
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.publicKey) });
      await studioClient.push.subscribe(subscription.toJSON());
      setPushState('enabled');
    } catch (pushError) { setPushState('error'); setError(pushError.message); }
  };
  const publishAnnouncement = async () => {
    if (!announcement.body.trim()) return;
    setBusy(true);
    try {
      const conversation = await studioClient.chat.announce(announcement);
      setAnnouncement({ title: 'Studio announcements', body: '' }); setShowAnnouncement(false);
      await load(); setActiveId(conversation.id);
    } catch (announcementError) { setError(announcementError.message); }
    finally { setBusy(false); }
  };
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
      <div className={`grid h-[calc(100dvh-14rem)] min-h-[430px] overflow-hidden border border-brass/15 bg-carbon sm:h-[calc(100dvh-13rem)] lg:grid-cols-[minmax(280px,330px)_minmax(0,1fr)] ${adminMode ? 'lg:h-[calc(100dvh-12rem)]' : 'lg:h-[calc(100dvh-10rem)]'} lg:min-h-[560px]`}>
        <aside className={`${activeId ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-col overflow-hidden border-r border-brass/15`}>
          <div className="shrink-0 border-b border-brass/15 p-4">
            <div className="flex items-center justify-between gap-3"><h2 className="font-display text-2xl text-ivory">{adminMode ? 'Studio conversations' : 'Messages'}</h2><div className="flex items-center gap-1">
              <button type="button" onClick={enablePush} title={pushState === 'enabled' ? 'Disable push alerts' : 'Enable push alerts'} className={`flex h-9 w-9 items-center justify-center border ${pushState === 'enabled' ? 'border-green-400/30 text-green-400' : 'border-brass/15 text-brass'}`}><Bell size={15} /></button>
              {adminMode && user?.role === 'admin' && <button type="button" onClick={() => setShowAnnouncement(value => !value)} title="New announcement" className="flex h-9 w-9 items-center justify-center border border-brass/15 text-brass"><Megaphone size={15} /></button>}
            </div></div>
            <p className="mt-1 text-xs text-ivory/35">Private conversations with signed-in members</p>
            <label className="mt-4 flex h-11 items-center gap-2 border border-brass/15 bg-obsidian px-3 text-ivory/55"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search people or chats" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
            <button type="button" onClick={() => setShowArchived(value => !value)} className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-ivory/40 hover:text-brass"><Archive size={13} />{showArchived ? 'Show active chats' : 'Archived chats'}</button>
            {showAnnouncement && user?.role === 'admin' && <div className="mt-3 space-y-2 border border-brass/15 bg-obsidian p-3"><input value={announcement.title} onChange={event => setAnnouncement(value => ({ ...value, title: event.target.value }))} className="h-10 w-full border border-brass/15 bg-carbon px-3 text-sm text-ivory outline-none" placeholder="Announcement title" /><textarea value={announcement.body} onChange={event => setAnnouncement(value => ({ ...value, body: event.target.value }))} className="h-24 w-full resize-none border border-brass/15 bg-carbon p-3 text-sm text-ivory outline-none" placeholder="Message every signed-in member" /><button type="button" disabled={busy || !announcement.body.trim()} onClick={publishAnnouncement} className="h-10 w-full bg-brass text-xs uppercase tracking-wider text-obsidian disabled:opacity-40">Publish announcement</button></div>}
          </div>
          {error && <p role="alert" className="border-b border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">{error}</p>}
          <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto [scrollbar-gutter:stable]">
            {matchingConversations.map(conversation => {
              const person = conversation.participants?.find(entry => entry.id !== user.id);
              return <button key={conversation.id} onClick={() => setActiveId(conversation.id)} className={`flex w-full items-center gap-3 border-b border-brass/10 p-4 text-left ${activeId === conversation.id ? 'bg-brass/10' : 'hover:bg-ivory/[0.03]'}`}>
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brass/10 text-xs font-semibold text-brass">{conversation.type === 'announcement' ? <Megaphone size={17} /> : initials(person?.name)}{person?.online && <i className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-carbon bg-green-400" />}</span>
                <span className="min-w-0 flex-1"><b className="block truncate text-sm text-ivory">{conversationName(conversation, user.id)}</b><small className="block truncate text-ivory/35">{conversation.typingUsers?.length ? `${conversation.typingUsers[0].name} is typing…` : conversation.lastMessage || 'Conversation started'}</small></span>
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

        <section className={`${!activeId ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-col overflow-hidden`}>
          {active ? <>
            <header className="shrink-0 flex items-center gap-2 border-b border-brass/15 p-3 sm:gap-3 sm:p-4">
              <button onClick={() => setActiveId('')} className="flex h-10 w-10 items-center justify-center text-brass lg:hidden" aria-label="Back to conversations"><ArrowLeft size={19} /></button>
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass/10 text-xs font-semibold text-brass">{active.type === 'announcement' ? <Megaphone size={17} /> : initials(other?.name)}{other?.online && <i className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-carbon bg-green-400" />}</span>
              <div className="min-w-0 flex-1"><p className="truncate font-display text-xl text-ivory">{conversationName(active, user.id)}</p><p className={`truncate text-xs ${active.typingUsers?.length || other?.online ? 'text-green-400' : 'text-ivory/35'}`}>{active.typingUsers?.length ? `${active.typingUsers[0].name} is typing…` : active.type === 'announcement' ? 'Studio updates for every member' : lastSeen(other)}</p></div>
              <button type="button" onClick={() => setSearchingMessages(value => !value)} className="flex h-10 w-10 items-center justify-center text-ivory/55 hover:text-brass" aria-label="Search this conversation"><Search size={17} /></button>
              <div className="relative"><button type="button" onClick={() => setShowConversationMenu(value => !value)} className="flex h-10 w-10 items-center justify-center text-ivory/55 hover:text-brass" aria-label="Conversation options"><MoreVertical size={18} /></button>
                {showConversationMenu && <div className="absolute right-0 top-11 z-30 w-52 border border-brass/20 bg-carbon p-1 shadow-2xl">
                  <button type="button" onClick={() => updateConversation({ muted: !active.muted })} className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-ivory/65 hover:bg-brass/10">{active.muted ? <Bell size={15} /> : <BellOff size={15} />}{active.muted ? 'Unmute alerts' : 'Mute alerts'}</button>
                  <button type="button" onClick={() => updateConversation({ archived: !active.archived })} className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-ivory/65 hover:bg-brass/10"><Archive size={15} />{active.archived ? 'Restore chat' : 'Archive chat'}</button>
                  {active.type !== 'announcement' && <button type="button" onClick={() => updateConversation({ blocked: !active.blockedByMe })} className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-red-300 hover:bg-red-400/10"><Ban size={15} />{active.blockedByMe ? 'Unblock person' : 'Block person'}</button>}
                </div>}
              </div>
            </header>
            {searchingMessages && <form onSubmit={runMessageSearch} className="flex gap-2 border-b border-brass/15 bg-carbon p-3"><label className="flex min-w-0 flex-1 items-center gap-2 border border-brass/15 bg-obsidian px-3"><Search size={14} className="text-brass" /><input autoFocus value={messageQuery} onChange={event => setMessageQuery(event.target.value)} placeholder="Search messages and files" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-ivory outline-none" /></label><button disabled={searchBusy} className="h-10 border border-brass/20 px-3 text-xs text-brass disabled:opacity-40">{searchBusy ? 'Searching…' : 'Search'}</button><button type="button" onClick={() => { setMessageQuery(''); setSearchingMessages(false); loadMessages(activeId, '', { scrollToBottom: true }); }} className="h-10 w-10 border border-brass/20 text-ivory/50"><X size={15} className="mx-auto" /></button></form>}
            {error && <p role="alert" className="border-b border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">{error}</p>}
            {active.blocked && <p className="border-b border-amber-400/20 bg-amber-400/5 p-3 text-center text-xs text-amber-200">This conversation is blocked. Unblock it from the menu to send new messages.</p>}
            <div ref={messagesPaneRef} className="min-h-0 flex-1 space-y-3 overscroll-contain overflow-y-auto bg-obsidian/35 p-3 [scrollbar-gutter:stable] sm:p-6">
              {messages.map(message => {
                const mine = message.senderId === user.id;
                const attachment = message.attachmentUrl ? { url: message.attachmentUrl, name: message.attachmentName, type: message.attachmentType, bytes: message.attachmentBytes } : null;
                const groupedReactions = Object.values(message.reactions || {}).reduce((result, emoji) => ({ ...result, [emoji]: (result[emoji] || 0) + 1 }), {});
                return <div key={message.id} className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}><article className={`relative max-w-[90%] border p-3 sm:max-w-[72%] ${mine ? 'border-brass/20 bg-brass/10' : 'border-ivory/10 bg-carbon'}`}>
                  {message.replyPreview && <div className="mb-2 border-l-2 border-brass/50 bg-black/20 px-3 py-2 text-xs text-ivory/45"><Reply size={12} className="mb-1 inline text-brass" /> {message.replyPreview}</div>}
                  {message.deletedForEveryone ? <p className="flex items-center gap-2 text-sm italic text-ivory/35"><Ban size={14} />This message was deleted.</p> : editing?.id === message.id ? <div className="space-y-2"><textarea autoFocus value={editing.body} onChange={event => setEditing({ ...editing, body: event.target.value })} className="min-h-20 w-full resize-none border border-brass/20 bg-obsidian p-2 text-sm text-ivory outline-none" /><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="h-8 px-3 text-xs text-ivory/50">Cancel</button><button type="button" onClick={saveEdit} className="h-8 bg-brass px-3 text-xs text-obsidian">Save</button></div></div> : message.body && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ivory/75">{message.body}</p>}
                  <AttachmentPreview attachment={attachment} onOpen={setPreview} />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    {!message.deletedForEveryone && <div className="relative flex items-center gap-1"><button type="button" onClick={() => setReplyingTo(message)} title="Reply" className="flex h-7 w-7 items-center justify-center text-ivory/30 hover:text-brass"><Reply size={13} /></button><button type="button" onClick={() => setReactionPickerId(value => value === message.id ? '' : message.id)} title="React" className="flex h-7 w-7 items-center justify-center text-ivory/30 hover:text-brass"><Smile size={13} /></button><button type="button" onClick={() => setMessageMenuId(value => value === message.id ? '' : message.id)} title="Message options" className="flex h-7 w-7 items-center justify-center text-ivory/30 hover:text-brass"><MoreVertical size={13} /></button>
                      {reactionPickerId === message.id && <div className="absolute bottom-8 left-0 z-20 flex gap-1 border border-brass/15 bg-carbon p-2 shadow-xl">{REACTIONS.map(emoji => <button type="button" key={emoji} onClick={() => { react(message, emoji); setReactionPickerId(''); }} className={`px-1 text-lg ${message.reactions?.[user.id] === emoji ? 'bg-brass/15' : ''}`}>{emoji}</button>)}</div>}
                      {messageMenuId === message.id && <div className="absolute bottom-8 left-12 z-20 w-44 border border-brass/15 bg-carbon p-1 shadow-xl">{mine && message.body && <button type="button" onClick={() => { setEditing({ id: message.id, body: message.body }); setMessageMenuId(''); }} className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-xs text-ivory/65 hover:bg-brass/10"><Pencil size={12} />Edit message</button>}<button type="button" onClick={() => { removeMessage(message, 'me'); setMessageMenuId(''); }} className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-xs text-ivory/65 hover:bg-brass/10"><Trash2 size={12} />Delete for me</button>{mine && <button type="button" onClick={() => { removeMessage(message, 'everyone'); setMessageMenuId(''); }} className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-xs text-red-300 hover:bg-red-400/10"><Trash2 size={12} />Delete for everyone</button>}</div>}
                    </div>}
                    <div className="flex items-center gap-1 text-[10px] text-ivory/30">{message.editedAt && <span>edited · </span>}{new Date(message.created_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{mine && <CheckCheck size={13} aria-label={message.readAt ? 'Read' : 'Delivered'} className={message.readAt ? 'text-sky-400' : 'text-ivory/35'} />}</div>
                  </div>
                  {Object.keys(groupedReactions).length > 0 && <div className="absolute -bottom-3 right-2 rounded-full border border-brass/15 bg-carbon px-2 py-0.5 text-xs shadow-lg">{Object.entries(groupedReactions).map(([emoji, count]) => <span key={emoji} className="mr-1">{emoji}{count > 1 ? count : ''}</span>)}</div>}
                  {adminMode && attachment && <button type="button" onClick={() => setForwarding(message)} className="mt-3 block text-[10px] uppercase tracking-wider text-brass/70 hover:text-brass">{message.allowForward ? 'Forwarding allowed' : 'Allow customer forwarding'}</button>}
                </article></div>;
              })}
              {!messages.length && <div className="py-16 text-center"><MessageCircle className="mx-auto text-brass/40" /><p className="mt-3 text-sm text-ivory/35">Start the conversation. Messages and files stay with this account.</p></div>}
            </div>
            <footer className="shrink-0 border-t border-brass/15 bg-carbon p-2.5 sm:p-3">
              {replyingTo && <div className="mb-2 flex items-center gap-3 border-l-2 border-brass bg-obsidian px-3 py-2"><Reply size={14} className="text-brass" /><p className="min-w-0 flex-1 truncate text-xs text-ivory/50">Replying to: {replyingTo.body || replyingTo.attachmentName || 'Attachment'}</p><button type="button" onClick={() => setReplyingTo(null)}><X size={15} /></button></div>}
              {file && <div className="mb-2 flex items-start gap-3 border border-brass/15 bg-obsidian p-2"><div className="max-w-[240px] flex-1"><AttachmentPreview compact attachment={{ url: filePreview, name: file.name, type: file.type, bytes: file.size }} /></div><button type="button" onClick={() => setFile(null)} className="flex h-8 w-8 items-center justify-center text-ivory/50"><X size={16} /></button></div>}
              {busy && file && <div className="mb-2 border border-brass/15 bg-obsidian p-3"><div className="flex items-center justify-between text-xs"><span className="truncate text-ivory/55">Uploading {file.name}</span><span className="text-brass">{uploadProgress}%</span></div><div className="mt-2 h-1.5 overflow-hidden bg-ivory/10"><div className="h-full bg-brass transition-all" style={{ width: `${uploadProgress}%` }} /></div><button type="button" onClick={() => uploadAbortRef.current?.abort()} className="mt-2 text-[10px] uppercase tracking-wider text-red-300">Cancel upload</button></div>}
              {uploadFailed && file && !busy && <button type="button" onClick={send} className="mb-2 flex h-10 w-full items-center justify-center gap-2 border border-red-400/25 text-xs text-red-300"><RotateCcw size={14} />Retry failed upload</button>}
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-2">
                <label className={`flex h-11 w-11 shrink-0 items-center justify-center border border-brass/20 text-brass ${active.blocked || (active.type === 'announcement' && !adminMode) ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`} title="Attach image, video, audio or document"><Paperclip size={17} /><input type="file" disabled={active.blocked || (active.type === 'announcement' && !adminMode)} className="hidden" accept="image/*,video/*,audio/*,.pdf,.docx,.xlsx,.pptx,.zip" onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
                <textarea value={text} disabled={recording || active.blocked || (active.type === 'announcement' && !adminMode)} onChange={event => updateTyping(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} rows={2} placeholder={recording ? 'Recording voice message…' : active.type === 'announcement' && !adminMode ? 'Only studio staff can publish announcements' : 'Write a message…'} className="min-w-0 flex-1 resize-none border border-brass/20 bg-obsidian p-3 text-sm text-ivory outline-none disabled:opacity-50" />
                {!recording && (text.trim() || file) ? <button disabled={busy || active.blocked || (active.type === 'announcement' && !adminMode)} onClick={send} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brass text-obsidian disabled:opacity-40" aria-label="Send message">{busy ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}</button> : <button type="button" disabled={busy || active.blocked || (active.type === 'announcement' && !adminMode)} onClick={toggleRecording} title={recording ? 'Stop recording' : 'Record voice message'} aria-label={recording ? 'Stop voice recording' : 'Record voice message'} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border disabled:opacity-40 ${recording ? 'animate-pulse border-red-400 bg-red-400/10 text-red-300' : 'border-brass/20 bg-brass text-obsidian'}`}>{recording ? <Square size={15} fill="currentColor" /> : <Mic size={18} />}</button>}
              </div>
              {recording && <p className="mt-2 text-xs text-red-300">Recording voice message… press the stop button when you are finished.</p>}
            </footer>
          </> : <div className="m-auto p-8 text-center"><MessageCircle className="mx-auto text-brass" size={34} /><p className="mt-4 font-display text-2xl text-ivory">Choose a conversation</p><p className="mt-2 text-sm text-ivory/40">Search signed-in people or continue an existing chat.</p></div>}
        </section>
      </div>
      <PreviewOverlay attachment={preview} onClose={() => setPreview(null)} />
    </>
  );
}
