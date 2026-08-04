import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  Archive, ArrowDown, ArrowLeft, Ban, Bell, BellOff, CheckCheck, Clapperboard, Download, File, FileArchive, FileSpreadsheet, FileText, Forward, Image, Images, Loader2,
  Megaphone, MessageCircle, Mic, MoreVertical, Paperclip, Pencil, Plus, Reply, RotateCcw,
  Mail, Pin, Search, Send, ShoppingBag, Smile, Square, Star, Trash2, Users, WifiOff, X,
} from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import { useAuth } from '@/lib/AuthContext';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const MAX_FILE_BYTES = 75 * 1024 * 1024;
const inferMimeType = file => {
  if (file?.type) return file.type;
  const extension = String(file?.name || '').split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic'].includes(extension)) return `image/${extension === 'jpg' ? 'jpeg' : extension}`;
  if (['mp4', 'webm', 'mov'].includes(extension)) return `video/${extension === 'mov' ? 'quicktime' : extension}`;
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(extension)) return `audio/${extension === 'm4a' ? 'mp4' : extension}`;
  if (extension === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
};
const fileVisual = (type, name = '') => {
  const value = `${type || ''} ${name}`.toLowerCase();
  if (value.includes('pdf')) return { Icon: FileText, label: 'PDF document', color: 'bg-red-600 text-white' };
  if (/word|document|\.docx?\b/.test(value)) return { Icon: FileText, label: 'Word document', color: 'bg-blue-600 text-white' };
  if (/sheet|excel|\.xlsx?\b|\.csv\b/.test(value)) return { Icon: FileSpreadsheet, label: 'Spreadsheet', color: 'bg-emerald-600 text-white' };
  if (/presentation|powerpoint|\.pptx?\b/.test(value)) return { Icon: FileText, label: 'Presentation', color: 'bg-orange-600 text-white' };
  if (/zip|archive/.test(value)) return { Icon: FileArchive, label: 'Archive', color: 'bg-purple-600 text-white' };
  return { Icon: File, label: 'Shared file', color: 'bg-brass/15 text-brass' };
};
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
      {name && <span title={name} className="block truncate px-3 py-2 text-xs text-ivory/60">{name}</span>}
    </button>
  );
  if (type?.startsWith('video/')) return (
    <div className="mt-2 overflow-hidden border border-brass/15 bg-black">
      <video src={url} controls preload="metadata" playsInline className={`${compact ? 'max-h-40' : 'max-h-72'} w-full`} />
      <p className="flex justify-between gap-3 px-3 py-2 text-xs text-ivory/60"><span title={name || 'Video'} className="truncate">{name || 'Video'}</span><span>{formatBytes(bytes)}</span></p>
    </div>
  );
  if (type?.startsWith('audio/')) return (
    <div className="mt-2 w-full min-w-0 max-w-full border border-brass/15 bg-obsidian p-3">
      <p title={name || 'Voice message'} className="mb-2 flex items-center gap-2 truncate text-xs text-brass"><Mic size={15} />{name || 'Voice message'}</p>
      <audio src={url} controls preload="metadata" className="h-9 w-full" />
    </div>
  );
  const { Icon, label, color } = fileVisual(type, name);
  return (
    <button type="button" onClick={() => onOpen?.(attachment)} className="mt-2 flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden border border-brass/15 bg-obsidian p-3 text-left text-xs text-brass">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center ${color}`}><Icon size={20} /></span>
      <span className="min-w-0 flex-1"><b title={name || 'Open attachment'} className="block truncate font-medium">{name || 'Open attachment'}</b><small className="text-ivory/35">{label} {formatBytes(bytes) && `· ${formatBytes(bytes)}`}</small></span>
      <Download size={16} />
    </button>
  );
}

function PreviewOverlay({ attachment, onClose }) {
  if (!attachment) return null;
  const isPdf = attachment.type?.includes('pdf');
  const previewUrl = attachment.previewUrl || attachment.url;
  const downloadUrl = attachment.downloadUrl || attachment.url;
  return (
    <div onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 z-[180] flex items-center justify-center bg-black/90 p-3 backdrop-blur-md sm:p-8" role="dialog" aria-modal="true" aria-label="Attachment preview">
      <div className="flex h-full max-h-[900px] w-full max-w-5xl flex-col border border-brass/25 bg-obsidian shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-brass/15 p-3 sm:p-4">
          <div className="min-w-0"><p title={attachment.name || 'Attachment preview'} className="break-all text-sm text-ivory">{attachment.name || 'Attachment preview'}</p><p className="text-xs text-ivory/35">{formatBytes(attachment.bytes)}</p></div>
          <div className="flex gap-2"><a href={downloadUrl} target="_blank" rel="noreferrer" download className="flex h-10 items-center gap-2 border border-brass/20 px-3 text-xs text-brass"><Download size={15} /><span className="hidden sm:inline">Download file</span></a><button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center border border-brass/20 text-ivory"><X size={18} /></button></div>
        </header>
        <div className="min-h-0 flex-1 bg-black/40 p-2 sm:p-4">
          {attachment.type?.startsWith('image/') && <img src={previewUrl} alt={attachment.name || 'Shared image'} className="h-full w-full object-contain" />}
          {isPdf && <>
            <iframe src={previewUrl} title={attachment.name || 'PDF preview'} className="hidden h-full w-full bg-white md:block" />
            <div className="flex h-full flex-col items-center justify-center px-5 text-center md:hidden">
              <span className="flex h-20 w-20 items-center justify-center bg-red-600 text-white"><FileText size={38} /></span>
              <h3 className="mt-5 max-w-full break-words font-display text-2xl text-ivory">{attachment.name || 'PDF document'}</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-ivory/55">Mobile browsers do not reliably display PDF files inside a page. Open it in your phone's PDF viewer or download a copy.</p>
              <div className="mt-6 grid w-full max-w-sm gap-3">
                <a href={previewUrl} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 bg-brass px-4 text-xs uppercase tracking-wider text-obsidian"><FileText size={16} />Open PDF</a>
                <a href={downloadUrl} target="_blank" rel="noreferrer" download className="flex min-h-12 items-center justify-center gap-2 border border-brass/25 px-4 text-xs uppercase tracking-wider text-brass"><Download size={16} />Download PDF</a>
              </div>
            </div>
          </>}
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
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [attachments, setAttachments] = useState([]);
  const [preview, setPreview] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [query, setQuery] = useState('');
  const [messageQuery, setMessageQuery] = useState('');
  const [searchingMessages, setSearchingMessages] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [conversationFilter, setConversationFilter] = useState('all');
  const [queuedCount, setQueuedCount] = useState(0);
  const [showConversationMenu, setShowConversationMenu] = useState(false);
  const [editing, setEditing] = useState(null);
  const [messageMenuId, setMessageMenuId] = useState('');
  const [reactionPickerId, setReactionPickerId] = useState('');
  const [messageMenuPosition, setMessageMenuPosition] = useState(null);
  const [reactionPickerPosition, setReactionPickerPosition] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploadFailed, setUploadFailed] = useState(false);
  const [pushState, setPushState] = useState('unknown');
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [shopPickerOpen, setShopPickerOpen] = useState(false);
  const [resourceKind, setResourceKind] = useState('shop');
  const [shopProducts, setShopProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [shopLoading, setShopLoading] = useState(false);
  const [announcement, setAnnouncement] = useState({ title: 'Community Updates', body: '' });
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [connectionState, setConnectionState] = useState('connecting');
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const messagesPaneRef = useRef(null);
  const recorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const attachmentsRef = useRef([]);
  const chunksRef = useRef([]);
  const uploadAbortRef = useRef(null);
  const photosInputRef = useRef(null);
  const documentsInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const typingTimerRef = useRef(null);
  const initializedSelectionRef = useRef(false);
  const typingLastSentRef = useRef({ value: false, at: 0 });
  const activeIdRef = useRef('');
  const text = drafts[activeId] || '';
  const queueKey = `reigns-chat-outbox:${user?.id || 'guest'}`;
  const resourceCopy = {
    shop: { eyebrow: 'Share for negotiation', title: 'Choose Art Shop items', description: 'Select one or several products to send in this conversation.' },
    gallery: { eyebrow: 'Share studio work', title: 'Choose gallery artworks', description: 'Select one or several artworks to share in this conversation.' },
    films: { eyebrow: 'Share a process film', title: 'Choose Art Films', description: 'Select one or several studio films to share in this conversation.' },
  }[resourceKind];
  const setText = value => setDrafts(current => ({ ...current, [activeId]: typeof value === 'function' ? value(current[activeId] || '') : value }));
  const floatingPosition = (element, preferredWidth, preferredHeight) => {
    const rect = element.getBoundingClientRect();
    const gutter = 12;
    const width = Math.min(preferredWidth, window.innerWidth - (gutter * 2));
    const left = Math.min(window.innerWidth - width - gutter, Math.max(gutter, rect.right - width));
    const below = window.innerHeight - rect.bottom;
    const top = below >= preferredHeight + 8
      ? rect.bottom + 8
      : Math.max(gutter, rect.top - preferredHeight - 8);
    return { left, top, width, maxHeight: Math.max(120, window.innerHeight - top - gutter) };
  };
  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);
  useEffect(() => {
    const readQueue = () => {
      try { return JSON.parse(window.localStorage.getItem(queueKey) || '[]'); } catch { return []; }
    };
    const flushQueue = async () => {
      if (!navigator.onLine) return;
      const pending = readQueue();
      if (!pending.length) return setQueuedCount(0);
      const remaining = [];
      for (const item of pending) {
        try { await studioClient.chat.send(item.conversationId, item.payload); }
        catch { remaining.push(item); }
      }
      window.localStorage.setItem(queueKey, JSON.stringify(remaining));
      setQueuedCount(remaining.length);
      if (!remaining.length) {
        load().catch(() => {});
        if (activeIdRef.current) loadMessages(activeIdRef.current, '', { mergeLatest: true }).catch(() => {});
      }
    };
    setQueuedCount(readQueue().length);
    window.addEventListener('online', flushQueue);
    flushQueue();
    return () => window.removeEventListener('online', flushQueue);
  }, [queueKey]);
  useEffect(() => {
    if (adminMode) return undefined;
    document.documentElement.classList.toggle('messages-conversation-open', mobileConversationOpen);
    return () => document.documentElement.classList.remove('messages-conversation-open');
  }, [adminMode, mobileConversationOpen]);
  useEffect(() => {
    const closePopovers = event => {
      if (event.target?.closest?.('[data-chat-popover]')) return;
      setShowAttachmentMenu(false);
      setShowConversationMenu(false);
      setMessageMenuId('');
      setReactionPickerId('');
      setMessageMenuPosition(null);
      setReactionPickerPosition(null);
    };
    const closeWithEscape = event => {
      if (event.key !== 'Escape') return;
      setShowAttachmentMenu(false);
      setShowConversationMenu(false);
      setMessageMenuId('');
      setReactionPickerId('');
      setMessageMenuPosition(null);
      setReactionPickerPosition(null);
      setPreview(null);
      setForwardingMessage(null);
      setShopPickerOpen(false);
    };
    document.addEventListener('pointerdown', closePopovers);
    document.addEventListener('keydown', closeWithEscape);
    window.addEventListener('resize', closePopovers);
    document.addEventListener('scroll', closePopovers, true);
    return () => {
      document.removeEventListener('pointerdown', closePopovers);
      document.removeEventListener('keydown', closeWithEscape);
      window.removeEventListener('resize', closePopovers);
      document.removeEventListener('scroll', closePopovers, true);
    };
  }, []);

  const load = async () => {
    const [conversationRows, people] = await Promise.all([studioClient.chat.conversations(), studioClient.chat.directory()]);
    const currentProfiles = new Map(people.map(person => [person.id, person]));
    const hydratedConversations = conversationRows.map(conversation => ({
      ...conversation,
      participants: (conversation.participants || []).map(person => ({
        ...person,
        ...(currentProfiles.get(person.id) || {}),
      })),
    }));
    setConversations(hydratedConversations);
    setDirectory(people);
    if (!initializedSelectionRef.current && hydratedConversations[0]) {
      initializedSelectionRef.current = true;
      const requestedId = new URLSearchParams(window.location.search).get('conversation');
      setActiveId(hydratedConversations.some(row => row.id === requestedId) ? requestedId : hydratedConversations[0].id);
    }
  };
  const loadMessages = async (id, search = messageQuery, options = {}) => {
    if (!id) return;
    const pane = messagesPaneRef.current;
    const distanceFromBottom = pane
      ? pane.scrollHeight - pane.scrollTop - pane.clientHeight
      : Number.POSITIVE_INFINITY;
    const shouldFollowLatest = options.scrollToBottom || distanceFromBottom < 120;
    const response = await studioClient.chat.messages(id, { query: search, before: options.before || '', limit: 60 });
    const rows = Array.isArray(response) ? response : response.items || [];
    setNextCursor(Array.isArray(response) ? null : response.nextCursor || null);
    setMessages(current => options.mergeLatest
      ? [...new Map([...current, ...rows].map(item => [item.id, item])).values()].sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)))
      : rows);
    const hasUnreadIncoming = rows.some(message => message.senderId !== user.id && !(message.readBy || []).includes(user.id));
    if (hasUnreadIncoming) {
      await studioClient.chat.markRead(id);
      window.dispatchEvent(new CustomEvent('atelier:refresh-badge'));
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const currentPane = messagesPaneRef.current;
      if (!currentPane) return;
      if (options.scrollToTop) currentPane.scrollTop = 0;
      else if (shouldFollowLatest) currentPane.scrollTop = currentPane.scrollHeight;
    }));
  };

  useEffect(() => {
    load().then(() => setConnectionState('connected')).catch(loadError => { setConnectionState('offline'); setError(loadError.message); });
    studioClient.chat.heartbeat().catch(() => {});
    const timer = window.setInterval(() => {
      load().then(() => setConnectionState('connected')).catch(() => setConnectionState('offline'));
      studioClient.chat.heartbeat().catch(() => {});
      if (activeId) loadMessages(activeId, '', { mergeLatest: true }).catch(() => setConnectionState('offline'));
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [activeId]);
  useEffect(() => {
    if (!window.EventSource) return undefined;
    const stream = new EventSource('/api/chat/events', { withCredentials: true });
    stream.addEventListener('ready', () => setConnectionState('connected'));
    const refresh = event => {
      setConnectionState('connected');
      const payload = JSON.parse(event.data || '{}');
      load().catch(() => setConnectionState('offline'));
      if (payload.conversationId === activeIdRef.current) loadMessages(payload.conversationId, '', { mergeLatest: true }).catch(() => setConnectionState('offline'));
    };
    ['message', 'read', 'typing', 'conversation'].forEach(name => stream.addEventListener(name, refresh));
    stream.onerror = () => setConnectionState('reconnecting');
    return () => stream.close();
  }, []);
  useEffect(() => {
    activeIdRef.current = activeId;
    setMessageQuery('');
    setSearchingMessages(false);
    setReplyingTo(null);
    setEditing(null);
    setMessageMenuId('');
    setReactionPickerId('');
    setShowConversationMenu(false);
    setPreview(null);
    setForwardingMessage(null);
    setError('');
    setAttachments(current => {
      current.forEach(item => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    loadMessages(activeId, '', { scrollToBottom: true }).catch(loadError => setError(loadError.message));
  }, [activeId]);
  useEffect(() => {
    const detectPush = async () => {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return setPushState('unsupported');
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setPushState(window.Notification.permission === 'granted' && subscription ? 'enabled' : 'disabled');
    };
    detectPush().catch(() => setPushState('disabled'));
    return () => {
      window.clearTimeout(typingTimerRef.current);
      uploadAbortRef.current?.abort();
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.ondataavailable = null;
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      recordingStreamRef.current?.getTracks().forEach(track => track.stop());
      attachmentsRef.current.forEach(item => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  const active = conversations.find(conversation => conversation.id === activeId);
  const other = active?.participants?.find(person => person.id !== user.id);
  const matchingConversations = useMemo(() => conversations.filter(conversation => {
    if (Boolean(conversation.archived) !== showArchived) return false;
    if (conversationFilter === 'unread' && !conversation.unread) return false;
    if (conversationFilter === 'favourites' && !conversation.favourite) return false;
    if (conversationFilter === 'groups' && !['group', 'announcement'].includes(conversation.type)) return false;
    return `${conversationName(conversation, user.id)} ${conversation.lastMessage || ''}`.toLowerCase().includes(query.toLowerCase());
  }), [conversations, conversationFilter, query, showArchived, user.id]);
  const existingIds = new Set(conversations.filter(conversation => conversation.type !== 'announcement').flatMap(conversation => conversation.participantIds || []));
  const matchingPeople = useMemo(() => directory.filter(person => !existingIds.has(person.id) && `${person.name} ${person.role}`.toLowerCase().includes(query.toLowerCase())), [directory, conversations, query]);

  const start = async person => {
    setError('');
    try {
      const conversation = await studioClient.chat.start(person.id);
      await load();
      setActiveId(conversation.id);
      setMobileConversationOpen(true);
    } catch (startError) { setError(startError.message); }
  };
  const chooseFiles = selectedFiles => {
    setError('');
    const selected = [...(selectedFiles || [])];
    if (!selected.length) return;
    const oversized = selected.find(item => item.size > MAX_FILE_BYTES);
    if (oversized) return setError(`${oversized.name} is larger than the 75 MB limit.`);
    const availableSlots = Math.max(0, 10 - attachments.length);
    const additions = selected.slice(0, availableSlots).map(item => ({
      id: `${Date.now()}-${crypto.randomUUID?.() || Math.random()}`,
      file: item,
      mime: inferMimeType(item),
      previewUrl: URL.createObjectURL(item),
    }));
    setAttachments(current => [...current, ...additions].slice(0, 10));
    if (selected.length > availableSlots) setError('You can attach up to 10 files to one send.');
  };
  const removeAttachment = id => setAttachments(current => {
    const removed = current.find(item => item.id === id);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    return current.filter(item => item.id !== id);
  });
  const openResourcePicker = async kind => {
    setShowAttachmentMenu(false); setShopPickerOpen(true); setShopLoading(true); setError('');
    setResourceKind(kind);
    try {
      const entity = kind === 'gallery' ? studioClient.entities.Artwork : kind === 'films' ? studioClient.entities.Video : studioClient.entities.ShopProduct;
      const rows = await entity.list('-created_date', 100);
      setShopProducts(rows.map(item => ({
        ...item,
        imageUrl: kind === 'films' ? item.thumbnailUrl : item.imageUrl,
        shareUrl: `${window.location.origin}${kind === 'gallery' ? '/gallery' : kind === 'films' ? '/videos' : '/shop'}`,
        shareLabel: kind === 'gallery' ? 'Gallery artwork' : kind === 'films' ? 'Art Film' : 'Art Shop item',
      })));
    }
    catch (loadError) { setError(loadError.message); setShopPickerOpen(false); }
    finally { setShopLoading(false); }
  };
  const openShopPicker = () => openResourcePicker('shop');
  const sendShopSelection = async () => {
    const chosen = shopProducts.filter(product => selectedProducts.includes(product.id));
    if (!chosen.length || !activeId) return;
    setBusy(true); setError('');
    try {
      await studioClient.chat.sendBatch(activeId, chosen.map((product, index) => ({
        body: `${index === 0 ? 'I would like to discuss or negotiate these Art Shop items:\n\n' : ''}${product.title}${product.price != null ? ` — GHS ${Number(product.price).toLocaleString('en-GH', { minimumFractionDigits: 2 })}` : ''}\nView in the Art Shop: ${window.location.origin}/shop`,
        ...{ body: `${index === 0 ? `I would like to share these ${resourceKind === 'gallery' ? 'gallery artworks' : resourceKind === 'films' ? 'Art Films' : 'Art Shop items'}:\n\n` : ''}${product.title}${resourceKind === 'shop' && product.price != null ? ` — GHS ${Number(product.price).toLocaleString('en-GH', { minimumFractionDigits: 2 })}` : ''}\n${product.shareLabel}: ${product.shareUrl}${resourceKind === 'films' && product.videoUrl ? `\nWatch source: ${product.videoUrl}` : ''}` },
        attachmentUrl: product.imageUrl || '',
        attachmentName: product.title,
        attachmentType: product.imageUrl ? 'image/jpeg' : '',
        attachmentBytes: 0,
        allowForward: false,
      })));
      setSelectedProducts([]); setShopPickerOpen(false);
      await loadMessages(activeId, '', { scrollToBottom: true }); await load();
    } catch (sendError) { setError(sendError.message); }
    finally { setBusy(false); }
  };
  const send = async () => {
    if ((!text.trim() && !attachments.length) || !activeId) return;
    setBusy(true);
    setUploadFailed(false);
    setUploadProgress(Object.fromEntries(attachments.map(item => [item.id, 1])));
    setError('');
    try {
      if (!attachments.length) {
        await studioClient.chat.send(activeId, { clientId: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, body: text.trim(), replyToId: replyingTo?.id || null, allowForward: false });
      } else {
        uploadAbortRef.current = new AbortController();
        const messages = [];
        for (let index = 0; index < attachments.length; index += 1) {
          const item = attachments[index];
          const uploaded = await studioClient.integrations.Core.UploadFileProgress({
            file: item.file,
            purpose: 'chat-attachment',
            signal: uploadAbortRef.current.signal,
            onProgress: progress => setUploadProgress(current => ({ ...current, [item.id]: progress })),
          });
          messages.push({
            clientId: crypto.randomUUID?.() || `${Date.now()}-${index}-${Math.random()}`,
            body: index === 0 ? text.trim() : '',
            attachmentUrl: uploaded.file_url,
            attachmentName: item.file.name,
            attachmentType: item.file.name.startsWith('voice-message-') ? 'audio/webm' : uploaded.media?.mime || item.mime,
            attachmentBytes: item.file.size,
            replyToId: index === 0 ? replyingTo?.id || null : null,
            allowForward: false,
          });
        }
        await studioClient.chat.sendBatch(activeId, messages);
      }
      setText('');
      attachments.forEach(item => URL.revokeObjectURL(item.previewUrl));
      setAttachments([]); setReplyingTo(null);
      setUploadProgress({});
      await loadMessages(activeId, '', { scrollToBottom: true }); await load();
    } catch (sendError) {
      if (!attachments.length && (!navigator.onLine || /fetch|network|offline/i.test(String(sendError.message)))) {
        const queued = { conversationId: activeId, payload: { clientId: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, body: text.trim(), replyToId: replyingTo?.id || null, allowForward: false }, queuedAt: new Date().toISOString() };
        let pending = [];
        try { pending = JSON.parse(window.localStorage.getItem(queueKey) || '[]'); } catch { /* start a clean queue */ }
        pending.push(queued);
        window.localStorage.setItem(queueKey, JSON.stringify(pending.slice(-100)));
        setQueuedCount(pending.length);
        setText(''); setReplyingTo(null);
        setError('You are offline. This message is queued and will send automatically when the connection returns.');
        return;
      }
      setUploadFailed(Boolean(attachments.length) && sendError.name !== 'AbortError');
      setError(sendError.name === 'AbortError' ? 'Upload cancelled. Your files are still ready to retry.' : sendError.message);
    } finally { setBusy(false); uploadAbortRef.current = null; }
  };
  const setForwarding = async message => { await studioClient.chat.setForwarding(message.id, !message.allowForward); await loadMessages(activeId); };
  const forwardMessage = async conversationId => {
    if (!forwardingMessage) return;
    setBusy(true); setError('');
    try {
      await studioClient.chat.forward(forwardingMessage.id, conversationId);
      setForwardingMessage(null);
      setActiveId(conversationId);
      await load();
    } catch (forwardError) { setError(forwardError.message); }
    finally { setBusy(false); }
  };
  const react = async (message, emoji) => { await studioClient.chat.react(message.id, message.reactions?.[user.id] === emoji ? '' : emoji); await loadMessages(activeId); };
  const starMessage = async message => { await studioClient.chat.star(message.id, !(message.starredBy || []).includes(user.id)); await loadMessages(activeId); };
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
    const typing = Boolean(value.trim());
    const timestamp = Date.now();
    if (typing !== typingLastSentRef.current.value || timestamp - typingLastSentRef.current.at > 1200) {
      typingLastSentRef.current = { value: typing, at: timestamp };
      studioClient.chat.typing(activeId, typing).catch(() => {});
    }
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
  const loadOlderMessages = async () => {
    if (!activeId || !nextCursor || loadingOlder) return;
    const pane = messagesPaneRef.current;
    const previousHeight = pane?.scrollHeight || 0;
    setLoadingOlder(true);
    try {
      const response = await studioClient.chat.messages(activeId, { before: nextCursor, limit: 60 });
      const older = response.items || [];
      setMessages(current => [...older, ...current]);
      setNextCursor(response.nextCursor || null);
      window.requestAnimationFrame(() => {
        if (pane) pane.scrollTop = pane.scrollHeight - previousHeight;
      });
    } catch (olderError) { setError(olderError.message); }
    finally { setLoadingOlder(false); }
  };
  const handleMessageScroll = event => {
    const pane = event.currentTarget;
    setShowJumpToLatest(pane.scrollHeight - pane.scrollTop - pane.clientHeight > 220);
  };
  const jumpToLatest = () => {
    const pane = messagesPaneRef.current;
    if (pane) pane.scrollTo({ top: pane.scrollHeight, behavior: 'smooth' });
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
      setAnnouncement({ title: 'Community Updates', body: '' }); setShowAnnouncement(false);
      await load(); setActiveId(conversation.id);
    } catch (announcementError) { setError(announcementError.message); }
    finally { setBusy(false); }
  };
  const toggleRecording = async () => {
    setError('');
    if (recording) { recorderRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const voiceFile = new window.File([blob], `voice-message-${Date.now()}.webm`, { type });
        setAttachments(current => [...current, { id: `voice-${Date.now()}`, file: voiceFile, mime: type, previewUrl: URL.createObjectURL(voiceFile) }]);
        stream.getTracks().forEach(track => track.stop());
        recordingStreamRef.current = null;
        setRecording(false);
      };
      recorderRef.current = recorder;
      recorder.start(); setRecording(true);
    } catch { setError('Microphone access was not granted. You can still attach an audio file.'); }
  };

  return (
    <>
      <div className={`grid min-h-0 max-w-full overflow-hidden bg-carbon md:border md:border-brass/15 lg:grid-cols-[minmax(280px,330px)_minmax(0,1fr)] ${adminMode ? 'h-[clamp(360px,calc(100dvh-13rem),760px)]' : 'h-full'}`}>
        <aside className={`${mobileConversationOpen ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-col overflow-hidden border-r border-brass/15`}>
          <div className="shrink-0 border-b border-brass/15 p-4">
            <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2">{!adminMode && <Link to="/" aria-label="Return to the studio" className="flex h-9 w-9 shrink-0 items-center justify-center border border-brass/15 text-brass lg:hidden"><ArrowLeft size={17} /></Link>}<h2 className="truncate font-display text-2xl text-ivory">{adminMode ? 'Studio conversations' : 'Messages'}</h2></div><div className="flex items-center gap-1">
              <button type="button" onClick={enablePush} aria-label={pushState === 'enabled' ? 'Disable push alerts' : 'Enable push alerts'} title={pushState === 'enabled' ? 'Disable push alerts' : 'Enable push alerts'} className={`flex h-9 w-9 items-center justify-center border ${pushState === 'enabled' ? 'border-green-400/30 text-green-400' : 'border-brass/15 text-brass'}`}><Bell size={15} /></button>
              {adminMode && user?.role === 'admin' && <button type="button" onClick={() => setShowAnnouncement(value => !value)} aria-label="Post a community update" title="Post a community update" className="flex h-9 w-9 items-center justify-center border border-brass/15 text-brass"><Megaphone size={15} /></button>}
            </div></div>
            <p className="mt-1 text-xs text-ivory/35">Private conversations with signed-in members</p>
            <label className="mt-4 flex h-11 items-center gap-2 border border-brass/15 bg-obsidian px-3 text-ivory/55"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search people or chats" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
            <button type="button" onClick={() => setShowArchived(value => !value)} className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-ivory/40 hover:text-brass"><Archive size={13} />{showArchived ? 'Show active chats' : 'Archived chats'}</button>
            <div className="mt-3 flex max-w-full gap-1 overflow-x-auto pb-1">{[['all', 'All'], ['unread', 'Unread'], ['favourites', 'Favourites'], ['groups', 'Groups']].map(([value, label]) => <button type="button" key={value} onClick={() => setConversationFilter(value)} className={`min-h-8 shrink-0 rounded-full border px-3 text-[10px] uppercase tracking-wider ${conversationFilter === value ? 'border-brass bg-brass/15 text-brass' : 'border-brass/10 text-ivory/40'}`}>{label}</button>)}</div>
            {queuedCount > 0 && <p className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-amber-300"><WifiOff size={12} />{queuedCount} queued message{queuedCount === 1 ? '' : 's'} will retry automatically</p>}
            {showAnnouncement && user?.role === 'admin' && <div className="mt-3 space-y-2 border border-brass/15 bg-obsidian p-3"><p className="text-xs uppercase tracking-[0.2em] text-brass">Community Updates</p><p className="text-xs leading-5 text-ivory/45">Only administrators can publish. Every active member receives this update and an unread notification.</p><input value={announcement.title} onChange={event => setAnnouncement(value => ({ ...value, title: event.target.value }))} className="h-10 w-full border border-brass/15 bg-carbon px-3 text-sm text-ivory outline-none" placeholder="Update title" /><textarea value={announcement.body} onChange={event => setAnnouncement(value => ({ ...value, body: event.target.value }))} className="h-24 w-full resize-none border border-brass/15 bg-carbon p-3 text-sm text-ivory outline-none" placeholder="Write an update for every signed-in member" /><button type="button" disabled={busy || !announcement.body.trim()} onClick={publishAnnouncement} className="h-10 w-full bg-brass text-xs uppercase tracking-wider text-obsidian disabled:opacity-40">Post community update</button></div>}
          </div>
          {error && !activeId && <p role="alert" className="border-b border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">{error}</p>}
          <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto pb-20 [scrollbar-gutter:stable] md:pb-5">
            {matchingConversations.map(conversation => {
              const person = conversation.participants?.find(entry => entry.id !== user.id);
              return <button key={conversation.id} onClick={() => { setActiveId(conversation.id); setMobileConversationOpen(true); }} className={`flex w-full items-center gap-3 border-b border-brass/10 p-4 text-left ${activeId === conversation.id ? 'bg-brass/10' : 'hover:bg-ivory/[0.03]'}`}>
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brass/10 text-xs font-semibold text-brass"><span className="flex h-full w-full overflow-hidden rounded-full">{conversation.type === 'announcement' ? <span className="m-auto"><Megaphone size={17} /></span> : person?.avatarUrl ? <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" /> : <span className="m-auto">{initials(person?.name)}</span>}</span>{person?.online && <i className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-carbon bg-green-400" />}</span>
                <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><b className="block truncate text-sm text-ivory">{conversationName(conversation, user.id)}</b>{conversation.pinned && <Pin size={11} className="shrink-0 text-brass" aria-label="Pinned" />}{conversation.favourite && <Star size={11} className="shrink-0 fill-brass text-brass" aria-label="Favourite" />}</span><small className="block truncate text-ivory/35">{conversation.typingUsers?.length ? `${conversation.typingUsers[0].name} is typing…` : conversation.lastMessage || 'Conversation started'}</small></span>
                {conversation.unread > 0 && <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-green-500 px-1 text-xs text-white">{conversation.unread}</span>}
              </button>;
            })}
            <div className="border-t border-brass/15 p-4">
              <p className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-brass"><Users size={13} />Signed-in people</p>
              {matchingPeople.map(person => <button key={person.id} onClick={() => start(person)} className="flex min-h-12 w-full items-center gap-3 border-b border-brass/10 text-left text-sm text-ivory/60 hover:text-ivory"><span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ivory/5 text-[10px] text-brass"><span className="flex h-full w-full overflow-hidden rounded-full">{person.avatarUrl ? <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" /> : <span className="m-auto">{initials(person.name)}</span>}</span>{person.online && <i className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-carbon bg-green-400" />}</span><span className="min-w-0 flex-1 truncate">{person.name}</span><small className="text-brass/60">{person.role === 'customer' ? 'member' : person.role}</small></button>)}
              {!matchingPeople.length && !matchingConversations.length && <p className="py-6 text-center text-xs text-ivory/35">No people match your search.</p>}
            </div>
          </div>
        </aside>

        <section className={`${!mobileConversationOpen ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-col overflow-hidden`}>
          {active ? <>
            <header className="shrink-0 flex items-center gap-2 border-b border-brass/15 p-3 sm:gap-3 sm:p-4">
              <button onClick={() => setMobileConversationOpen(false)} className="flex h-10 w-10 items-center justify-center text-brass lg:hidden" aria-label="Back to conversations"><ArrowLeft size={19} /></button>
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass/10 text-xs font-semibold text-brass"><span className="flex h-full w-full overflow-hidden rounded-full">{active.type === 'announcement' ? <span className="m-auto"><Megaphone size={17} /></span> : other?.avatarUrl ? <img src={other.avatarUrl} alt="" className="h-full w-full object-cover" /> : <span className="m-auto">{initials(other?.name)}</span>}</span>{other?.online && <i className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-carbon bg-green-400" />}</span>
              <div className="min-w-0 flex-1"><p className="truncate font-display text-xl text-ivory">{conversationName(active, user.id)}</p><p className={`truncate text-xs ${active.typingUsers?.length || other?.online ? 'text-green-400' : 'text-ivory/35'}`}>{active.typingUsers?.length ? `${active.typingUsers[0].name} is typing…` : active.type === 'announcement' ? 'Official updates — only administrators can post' : lastSeen(other)}</p></div>
              {connectionState !== 'connected' && <span className="hidden items-center gap-1 text-[10px] uppercase tracking-wider text-amber-300 sm:flex"><WifiOff size={13} />{connectionState === 'offline' ? 'Offline' : 'Reconnecting'}</span>}
              <button type="button" onClick={() => setSearchingMessages(value => !value)} className="flex h-10 w-10 items-center justify-center text-ivory/55 hover:text-brass" aria-label="Search this conversation"><Search size={17} /></button>
              <div data-chat-popover className="relative"><button type="button" onClick={() => setShowConversationMenu(value => !value)} className="flex h-10 w-10 items-center justify-center text-ivory/55 hover:text-brass" aria-label="Conversation options"><MoreVertical size={18} /></button>
                {showConversationMenu && <div data-chat-popover className="absolute right-0 top-11 z-30 w-52 border border-brass/20 bg-carbon p-1 shadow-2xl">
                  <button type="button" onClick={() => updateConversation({ muted: !active.muted })} className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-ivory/65 hover:bg-brass/10">{active.muted ? <Bell size={15} /> : <BellOff size={15} />}{active.muted ? 'Unmute alerts' : 'Mute alerts'}</button>
                  <button type="button" onClick={() => updateConversation({ favourite: !active.favourite })} className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-ivory/65 hover:bg-brass/10"><Star size={15} className={active.favourite ? 'fill-brass text-brass' : ''} />{active.favourite ? 'Remove favourite' : 'Add to favourites'}</button>
                  <button type="button" onClick={() => updateConversation({ pinned: !active.pinned })} className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-ivory/65 hover:bg-brass/10"><Pin size={15} />{active.pinned ? 'Unpin chat' : 'Pin chat'}</button>
                  <button type="button" onClick={() => updateConversation({ markUnread: true })} className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-ivory/65 hover:bg-brass/10"><Mail size={15} />Mark as unread</button>
                  <button type="button" onClick={() => updateConversation({ archived: !active.archived })} className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-ivory/65 hover:bg-brass/10"><Archive size={15} />{active.archived ? 'Restore chat' : 'Archive chat'}</button>
                  {active.type !== 'announcement' && <button type="button" onClick={() => updateConversation({ blocked: !active.blockedByMe })} className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-red-300 hover:bg-red-400/10"><Ban size={15} />{active.blockedByMe ? 'Unblock person' : 'Block person'}</button>}
                </div>}
              </div>
            </header>
            {searchingMessages && <form onSubmit={runMessageSearch} className="flex gap-2 border-b border-brass/15 bg-carbon p-3"><label className="flex min-w-0 flex-1 items-center gap-2 border border-brass/15 bg-obsidian px-3"><Search size={14} className="text-brass" /><input autoFocus value={messageQuery} onChange={event => setMessageQuery(event.target.value)} placeholder="Search messages and files" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-ivory outline-none" /></label><button disabled={searchBusy} className="h-10 border border-brass/20 px-3 text-xs text-brass disabled:opacity-40">{searchBusy ? 'Searching…' : 'Search'}</button><button type="button" onClick={() => { setMessageQuery(''); setSearchingMessages(false); loadMessages(activeId, '', { scrollToBottom: true }); }} className="h-10 w-10 border border-brass/20 text-ivory/50"><X size={15} className="mx-auto" /></button></form>}
            {error && <p role="alert" className="border-b border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">{error}</p>}
            {active.blocked && <p className="border-b border-amber-400/20 bg-amber-400/5 p-3 text-center text-xs text-amber-200">{active.blockedByMe ? 'You blocked this conversation. Use the menu to unblock it.' : 'This person is not accepting messages from this conversation.'}</p>}
            <div ref={messagesPaneRef} onScroll={handleMessageScroll} tabIndex={0} role="log" aria-label={`Messages with ${conversationName(active, user.id)}`} aria-live="polite" className="relative min-h-0 min-w-0 flex-1 space-y-3 overscroll-contain overflow-x-hidden overflow-y-auto bg-obsidian/35 p-3 [scrollbar-gutter:stable] sm:p-6">
              {nextCursor && !messageQuery && <button type="button" disabled={loadingOlder} onClick={loadOlderMessages} className="mx-auto flex h-9 items-center gap-2 border border-brass/15 px-4 text-xs text-brass disabled:opacity-40">{loadingOlder && <Loader2 size={13} className="animate-spin" />}Load older messages</button>}
              {messages.map((message, index) => {
                const mine = message.senderId === user.id;
                const attachment = message.attachmentUrl ? { url: message.attachmentUrl, previewUrl: studioClient.chat.attachmentUrl(message.id), downloadUrl: studioClient.chat.attachmentUrl(message.id, true), name: message.attachmentName, type: message.attachmentType, bytes: message.attachmentBytes, messageId: message.id } : null;
                const groupedReactions = Object.values(message.reactions || {}).reduce((result, emoji) => ({ ...result, [emoji]: (result[emoji] || 0) + 1 }), {});
                const previous = messages[index - 1];
                const showDate = !previous || new Date(previous.created_date).toDateString() !== new Date(message.created_date).toDateString();
                return <div key={message.id} className="min-w-0 max-w-full">{showDate && <div className="my-4 flex items-center gap-3" aria-label={`Messages from ${new Date(message.created_date).toLocaleDateString()}`}><span className="h-px flex-1 bg-brass/10" /><span className="text-[10px] uppercase tracking-widest text-ivory/35">{new Date(message.created_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span><span className="h-px flex-1 bg-brass/10" /></div>}<div className={`group flex min-w-0 max-w-full ${mine ? 'justify-end' : 'justify-start'}`}><article className={`relative min-w-0 max-w-[90%] border p-3 sm:max-w-[72%] ${mine ? 'border-brass/20 bg-brass/10' : 'border-ivory/10 bg-carbon'}`}>
                  {message.replyPreview && <div className="mb-2 border-l-2 border-brass/50 bg-black/20 px-3 py-2 text-xs text-ivory/45"><Reply size={12} className="mb-1 inline text-brass" /> {message.replyPreview}</div>}
                  {message.deletedForEveryone ? <div className="flex items-center gap-3"><p className="flex items-center gap-2 text-sm italic text-ivory/35"><Ban size={14} />This message was deleted.</p><button type="button" onClick={() => removeMessage(message, 'me')} className="text-[10px] uppercase tracking-wider text-ivory/30 hover:text-brass">Remove</button></div> : editing?.id === message.id ? <div className="space-y-2"><textarea autoFocus value={editing.body} onChange={event => setEditing({ ...editing, body: event.target.value })} className="min-h-20 w-full resize-none border border-brass/20 bg-obsidian p-2 text-sm text-ivory outline-none" /><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="h-8 px-3 text-xs text-ivory/50">Cancel</button><button type="button" onClick={saveEdit} className="h-8 bg-brass px-3 text-xs text-obsidian">Save</button></div></div> : message.body && <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-ivory/75">{message.body}</p>}
                  <AttachmentPreview attachment={attachment} onOpen={setPreview} />
                  {message.starredBy?.includes(user.id) && <Star size={12} className="absolute right-2 top-2 fill-brass text-brass" aria-label="Starred message" />}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    {!message.deletedForEveryone && <div data-chat-popover className="relative flex items-center gap-1"><button type="button" onClick={() => setReplyingTo(message)} title="Reply" className="flex h-7 w-7 items-center justify-center text-ivory/30 hover:text-brass"><Reply size={13} /></button><button type="button" onClick={event => { const opening = reactionPickerId !== message.id; setReactionPickerId(opening ? message.id : ''); setReactionPickerPosition(opening ? floatingPosition(event.currentTarget, 238, 60) : null); setMessageMenuId(''); }} title="React" className="flex h-7 w-7 items-center justify-center text-ivory/30 hover:text-brass"><Smile size={13} /></button><button type="button" onClick={event => { const opening = messageMenuId !== message.id; setMessageMenuId(opening ? message.id : ''); setMessageMenuPosition(opening ? floatingPosition(event.currentTarget, 220, 190) : null); setReactionPickerId(''); }} title="Message options" className="flex h-7 w-7 items-center justify-center text-ivory/30 hover:text-brass"><MoreVertical size={13} /></button></div>}
                    <div className="flex items-center gap-1 text-[10px] text-ivory/30">{message.editedAt && <span>edited · </span>}{new Date(message.created_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{mine && <CheckCheck size={13} aria-label={message.readAt ? 'Read' : 'Delivered'} className={message.readAt ? 'text-sky-400' : 'text-ivory/35'} />}</div>
                  </div>
                  {Object.keys(groupedReactions).length > 0 && <div className="absolute -bottom-3 right-2 rounded-full border border-brass/15 bg-carbon px-2 py-0.5 text-xs shadow-lg">{Object.entries(groupedReactions).map(([emoji, count]) => <span key={emoji} className="mr-1">{emoji}{count > 1 ? count : ''}</span>)}</div>}
                  {adminMode && attachment && <button type="button" onClick={() => setForwarding(message)} className="mt-3 block text-[10px] uppercase tracking-wider text-brass/70 hover:text-brass">{message.allowForward ? 'Forwarding allowed' : 'Allow customer forwarding'}</button>}
                </article></div></div>;
              })}
              {!messages.length && <div className="py-16 text-center"><MessageCircle className="mx-auto text-brass/40" /><p className="mt-3 text-sm text-ivory/35">Start the conversation. Messages and files stay with this account.</p></div>}
              {showJumpToLatest && <button type="button" onClick={jumpToLatest} className="sticky bottom-2 ml-auto flex h-10 items-center gap-2 rounded-full border border-brass/30 bg-carbon px-4 text-xs text-brass shadow-xl"><ArrowDown size={14} />Latest</button>}
            </div>
            <footer className="shrink-0 border-t border-brass/15 bg-carbon p-2.5 sm:p-3">
              {replyingTo && <div className="mb-2 flex items-center gap-3 border-l-2 border-brass bg-obsidian px-3 py-2"><Reply size={14} className="text-brass" /><p className="min-w-0 flex-1 truncate text-xs text-ivory/50">Replying to: {replyingTo.body || replyingTo.attachmentName || 'Attachment'}</p><button type="button" onClick={() => setReplyingTo(null)}><X size={15} /></button></div>}
              {attachments.length > 0 && <div className="mb-2 min-w-0 max-w-full overflow-hidden border border-brass/15 bg-obsidian p-2"><div className="flex max-h-52 max-w-full gap-2 overflow-x-auto overscroll-contain pb-1 [scrollbar-gutter:stable]">{attachments.map(item => <div key={item.id} className="relative w-40 shrink-0 border border-brass/10 bg-carbon p-2"><AttachmentPreview compact attachment={{ url: item.previewUrl, name: item.file.name, type: item.mime, bytes: item.file.size }} onOpen={setPreview} /><button type="button" disabled={busy} onClick={() => removeAttachment(item.id)} aria-label={`Remove ${item.file.name}`} className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/80 text-white disabled:opacity-40"><X size={14} /></button>{busy && <div className="mt-2"><div className="flex justify-between text-[10px] text-ivory/45"><span>Uploading</span><span>{uploadProgress[item.id] || 0}%</span></div><div className="mt-1 h-1 overflow-hidden bg-ivory/10"><div className="h-full bg-brass transition-all" style={{ width: `${uploadProgress[item.id] || 0}%` }} /></div></div>}</div>)}</div><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><span className="text-[10px] uppercase tracking-wider text-ivory/35">{attachments.length} of 10 files selected</span><div className="flex items-center gap-3">{attachments.length < 10 && !busy && <label className="flex min-h-9 cursor-pointer items-center gap-1.5 border border-brass/20 px-3 text-[10px] uppercase tracking-wider text-brass"><Plus size={13} />Add more<input type="file" multiple className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" onChange={event => { chooseFiles(event.target.files); event.target.value = ''; }} /></label>}{busy && <button type="button" onClick={() => uploadAbortRef.current?.abort()} className="text-[10px] uppercase tracking-wider text-red-300">Cancel upload</button>}</div></div></div>}
              {uploadFailed && attachments.length > 0 && !busy && <button type="button" onClick={send} className="mb-2 flex h-10 w-full items-center justify-center gap-2 border border-red-400/25 text-xs text-red-300"><RotateCcw size={14} />Retry failed upload</button>}
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-2">
                <div data-chat-popover className="relative">
                  <button type="button" disabled={active.blocked || (active.type === 'announcement' && !adminMode)} onClick={() => setShowAttachmentMenu(value => !value)} className="flex h-11 w-11 shrink-0 items-center justify-center border border-brass/20 text-brass disabled:cursor-not-allowed disabled:opacity-40" title="Add an attachment" aria-label="Open attachment menu"><Paperclip size={17} /></button>
                  {showAttachmentMenu && <div className="absolute bottom-12 left-0 z-50 w-[min(15rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden border border-brass/20 bg-carbon p-1 shadow-2xl">
                    <button type="button" onClick={() => { setShowAttachmentMenu(false); photosInputRef.current?.click(); }} className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"><Image size={17} className="text-sky-400" /><span><b className="block font-medium">Photos & videos</b><small className="text-ivory/35">Choose one or several</small></span></button>
                    <button type="button" onClick={() => { setShowAttachmentMenu(false); documentsInputRef.current?.click(); }} className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"><FileText size={17} className="text-purple-400" /><span><b className="block font-medium">Documents</b><small className="text-ivory/35">PDF, Word, Excel, slides or ZIP</small></span></button>
                    <button type="button" onClick={() => { setShowAttachmentMenu(false); audioInputRef.current?.click(); }} className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"><Mic size={17} className="text-orange-400" /><span><b className="block font-medium">Audio</b><small className="text-ivory/35">Choose an audio recording</small></span></button>
                    <button type="button" onClick={openShopPicker} className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"><ShoppingBag size={17} className="text-brass" /><span><b className="block font-medium">Art Shop items</b><small className="text-ivory/35">Share items for discussion</small></span></button>
                    <button type="button" onClick={() => openResourcePicker('gallery')} className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"><Images size={17} className="text-emerald-400" /><span><b className="block font-medium">Gallery artworks</b><small className="text-ivory/35">Share finished works</small></span></button>
                    <button type="button" onClick={() => openResourcePicker('films')} className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"><Clapperboard size={17} className="text-violet-400" /><span><b className="block font-medium">Art Films</b><small className="text-ivory/35">Share a studio film</small></span></button>
                  </div>}
                  <input ref={photosInputRef} type="file" multiple className="hidden" accept="image/*,video/*" onChange={event => { chooseFiles(event.target.files); event.target.value = ''; }} />
                  <input ref={documentsInputRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" onChange={event => { chooseFiles(event.target.files); event.target.value = ''; }} />
                  <input ref={audioInputRef} type="file" multiple className="hidden" accept="audio/*" onChange={event => { chooseFiles(event.target.files); event.target.value = ''; }} />
                </div>
                <textarea value={text} disabled={recording || active.blocked || (active.type === 'announcement' && !adminMode)} onChange={event => updateTyping(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} rows={2} placeholder={recording ? 'Recording voice message…' : active.type === 'announcement' && !adminMode ? 'Community Updates is read-only for members' : 'Write a message…'} className="min-w-0 flex-1 resize-none border border-brass/20 bg-obsidian p-3 text-sm text-ivory outline-none disabled:opacity-50" />
                {!recording && (text.trim() || attachments.length) ? <button disabled={busy || active.blocked || (active.type === 'announcement' && !adminMode)} onClick={send} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brass text-obsidian disabled:opacity-40" aria-label="Send message">{busy ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}</button> : <button type="button" disabled={busy || active.blocked || (active.type === 'announcement' && !adminMode)} onClick={toggleRecording} title={recording ? 'Stop recording' : 'Record voice message'} aria-label={recording ? 'Stop voice recording' : 'Record voice message'} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border disabled:opacity-40 ${recording ? 'animate-pulse border-red-400 bg-red-400/10 text-red-300' : 'border-brass/20 bg-brass text-obsidian'}`}>{recording ? <Square size={15} fill="currentColor" /> : <Mic size={18} />}</button>}
              </div>
              {recording && <p className="mt-2 text-xs text-red-300">Recording voice message… press the stop button when you are finished.</p>}
            </footer>
          </> : <div className="m-auto p-8 text-center"><MessageCircle className="mx-auto text-brass" size={34} /><p className="mt-4 font-display text-2xl text-ivory">Choose a conversation</p><p className="mt-2 text-sm text-ivory/40">Search signed-in people or continue an existing chat.</p></div>}
        </section>
      </div>
      {reactionPickerId && reactionPickerPosition && createPortal(<div data-chat-popover style={reactionPickerPosition} className="fixed z-[220] flex gap-1 overflow-x-auto border border-brass/20 bg-carbon p-2 shadow-2xl">{REACTIONS.map(emoji => <button type="button" key={emoji} onClick={() => { const message = messages.find(item => item.id === reactionPickerId); if (message) react(message, emoji); setReactionPickerId(''); setReactionPickerPosition(null); }} className={`flex h-9 w-9 shrink-0 items-center justify-center text-lg ${messages.find(item => item.id === reactionPickerId)?.reactions?.[user.id] === emoji ? 'bg-brass/15' : 'hover:bg-brass/10'}`}>{emoji}</button>)}</div>, document.body)}
      {messageMenuId && messageMenuPosition && (() => {
        const message = messages.find(item => item.id === messageMenuId);
        if (!message) return null;
        const mine = message.senderId === user.id;
        const closeMenu = () => { setMessageMenuId(''); setMessageMenuPosition(null); };
        return createPortal(<div data-chat-popover style={messageMenuPosition} className="fixed z-[220] overflow-y-auto border border-brass/20 bg-carbon p-1 shadow-2xl">
          {mine && message.body && <button type="button" onClick={() => { setEditing({ id: message.id, body: message.body }); closeMenu(); }} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"><Pencil size={14} />Edit message</button>}
          <button type="button" onClick={() => { starMessage(message); closeMenu(); }} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"><Star size={14} className={message.starredBy?.includes(user.id) ? 'fill-brass text-brass' : ''} />{message.starredBy?.includes(user.id) ? 'Unstar message' : 'Star message'}</button>
          {(message.allowForward || ['admin', 'editor', 'support'].includes(user.role)) && <button type="button" onClick={() => { setForwardingMessage(message); closeMenu(); }} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"><Forward size={14} />Forward</button>}
          <button type="button" onClick={() => { removeMessage(message, 'me'); closeMenu(); }} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"><Trash2 size={14} />Delete for me</button>
          {mine && <button type="button" onClick={() => { removeMessage(message, 'everyone'); closeMenu(); }} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-red-300 hover:bg-red-400/10"><Trash2 size={14} />Delete for everyone</button>}
        </div>, document.body);
      })()}
      <PreviewOverlay attachment={preview} onClose={() => setPreview(null)} />
      {shopPickerOpen && <div onMouseDown={event => { if (event.target === event.currentTarget) { setShopPickerOpen(false); setSelectedProducts([]); } }} className="fixed inset-0 z-[176] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="shop-picker-title"><section className="flex max-h-[88dvh] w-full max-w-4xl flex-col border border-brass/25 bg-carbon shadow-2xl"><header className="flex items-center justify-between gap-3 border-b border-brass/15 p-4 sm:p-5"><div><p className="text-[10px] uppercase tracking-[.25em] text-brass">{resourceCopy.eyebrow}</p><h3 id="shop-picker-title" className="font-display text-2xl text-ivory sm:text-3xl">{resourceCopy.title}</h3><p className="mt-1 text-xs text-ivory/40">{resourceCopy.description}</p></div><button type="button" onClick={() => { setShopPickerOpen(false); setSelectedProducts([]); }} className="flex h-10 w-10 items-center justify-center border border-brass/15"><X size={17} /></button></header><div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">{shopLoading ? <div className="flex min-h-60 items-center justify-center"><Loader2 className="animate-spin text-brass" /></div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{shopProducts.map(product => { const selected = selectedProducts.includes(product.id); return <button type="button" key={product.id} onClick={() => setSelectedProducts(current => selected ? current.filter(id => id !== product.id) : [...current, product.id])} className={`overflow-hidden border text-left ${selected ? 'border-brass bg-brass/10' : 'border-brass/10 bg-obsidian'}`}><div className="relative aspect-[4/3] bg-black/30">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Image className="text-ivory/20" /></div>}{selected && <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-brass text-obsidian"><CheckCheck size={15} /></span>}</div><div className="p-3"><b title={product.title} className="block truncate text-sm text-ivory">{product.title}</b>{resourceKind === 'shop' && <span className="mt-1 block text-sm text-brass">GHS {Number(product.price || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</span>}</div></button>; })}</div>}</div><footer className="flex items-center justify-between gap-3 border-t border-brass/15 p-4"><span className="text-xs text-ivory/40">{selectedProducts.length} selected</span><button type="button" disabled={!selectedProducts.length || busy} onClick={sendShopSelection} className="min-h-11 bg-brass px-5 text-xs uppercase tracking-wider text-obsidian disabled:opacity-40">{busy ? 'Sending…' : 'Send selected items'}</button></footer></section></div>}
      {forwardingMessage && <div className="fixed inset-0 z-[175] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="forward-message-title"><div className="max-h-[80dvh] w-full max-w-md overflow-hidden border border-brass/25 bg-carbon shadow-2xl"><header className="flex items-center justify-between border-b border-brass/15 p-4"><div><h3 id="forward-message-title" className="font-display text-2xl text-ivory">Forward message</h3><p className="text-xs text-ivory/40">Choose one of your conversations</p></div><button type="button" onClick={() => setForwardingMessage(null)} aria-label="Close forward message" className="flex h-10 w-10 items-center justify-center border border-brass/15"><X size={17} /></button></header><div className="max-h-[60dvh] overflow-y-auto p-2">{conversations.filter(item => item.id !== activeId && !item.archived).map(item => <button type="button" disabled={busy} key={item.id} onClick={() => forwardMessage(item.id)} className="flex min-h-14 w-full items-center gap-3 border-b border-brass/10 px-3 text-left hover:bg-brass/10 disabled:opacity-40"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-brass/10 text-xs text-brass">{initials(conversationName(item, user.id))}</span><span className="truncate text-sm text-ivory/70">{conversationName(item, user.id)}</span></button>)}</div></div></div>}
    </>
  );
}
