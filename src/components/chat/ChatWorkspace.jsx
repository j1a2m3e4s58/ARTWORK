import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import {
  Archive,
  BarChart3,
  ArrowDown,
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Bookmark,
  Check,
  CheckCheck,
  CalendarDays,
  Camera,
  Clapperboard,
  Download,
  File,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Forward,
  Image,
  Images,
  Loader2,
  Lock,
  Pause,
  Play,
  Megaphone,
  MessageCircle,
  Mic,
  MoreVertical,
  Paperclip,
  Pencil,
  Plus,
  Reply,
  RotateCcw,
  Contact,
  Eye,
  ExternalLink,
  Flag,
  Mail,
  MapPin,
  Phone,
  Pin,
  Search,
  Send,
  ShoppingBag,
  Smile,
  Star,
  Timer,
  Trash2,
  Users,
  Video,
  WifiOff,
  X,
} from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import { useAuth } from '@/lib/AuthContext';
import useGlassConfirm from '@/hooks/useGlassConfirm';
import CallOverlay from '@/components/chat/CallOverlay';
import {
  cacheConversations,
  cacheMessages,
  decryptChatAttachment,
  decryptMessageRows,
  encryptChatAttachment,
  encryptChatText,
  publishDeviceKeys,
  readCachedConversations,
  readCachedMessages,
  readSyncCursor,
  writeSyncCursor,
} from '@/lib/chatSecure';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const STICKERS = ['🎨', '✨', '🔥', '👏', '💯', '🥳', '😍', '🙌', '🫶', '🌟', '✅', '😂'];
const MAX_FILE_BYTES = 75 * 1024 * 1024;
// Share in-flight work across refreshes so the same attachment is not downloaded
// and decrypted more than once while its message remains on screen.
const attachmentDecryptions = new Map();
const isEmojiOnlyMessage = value => {
  const text = String(value || '').trim();
  if (!text || text.length > 48 || !/\p{Extended_Pictographic}/u.test(text)) return false;
  return text.replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\ufe0e\ufe0f\s]/gu, '') === '';
};
const prepareChatImage = async (file, { square = false, camera = false } = {}) => {
  if (!String(file?.type || '').startsWith('image/') || /gif|svg/i.test(file.type)) return file;
  let prepared = file;
  try {
    const { default: compressImage } = await import('browser-image-compression');
    const compressed = await compressImage(file, {
      maxSizeMB: camera ? 0.7 : 1.15,
      maxWidthOrHeight: camera ? 1280 : 1600,
      useWebWorker: true,
      preserveExif: false,
      fileType: 'image/jpeg',
      initialQuality: camera ? 0.7 : 0.78,
    });
    const baseName = String(file.name || 'phone-photo').replace(/\.[^.]+$/, '');
    prepared = new File([compressed], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified || Date.now() });
  } catch {
    // Keep the original usable instead of rejecting the whole attachment batch.
    // This also covers browsers that cannot decode a particular gallery format.
    prepared = file;
  }
  if (!square) return prepared;
  const bitmap = await createImageBitmap(prepared);
  try {
    const sourceSize = square ? Math.min(bitmap.width, bitmap.height) : null;
    const sourceX = square ? Math.floor((bitmap.width - sourceSize) / 2) : 0;
    const sourceY = square ? Math.floor((bitmap.height - sourceSize) / 2) : 0;
    const sourceWidth = square ? sourceSize : bitmap.width;
    const sourceHeight = square ? sourceSize : bitmap.height;
    const scale = Math.min(1, 2048 / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return file;
    context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.84));
    if (!blob) return file;
    const baseName = String(prepared.name || 'camera-photo').replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}-cropped.jpg`, { type: 'image/jpeg', lastModified: prepared.lastModified || Date.now() });
  } finally {
    bitmap.close?.();
  }
};
const urlsInMessage = value => [...new Set(String(value || '').match(/https?:\/\/[^\s<>()]+/gi) || [])];
let notificationAudioContext;
const playReignsMessageSound = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    notificationAudioContext ||= new AudioContext();
    if (notificationAudioContext.state === 'suspended') notificationAudioContext.resume().catch(() => {});
    const start = notificationAudioContext.currentTime + 0.01;
    [659.25, 783.99, 987.77].forEach((frequency, index) => {
      const oscillator = notificationAudioContext.createOscillator();
      const gain = notificationAudioContext.createGain();
      const noteStart = start + index * 0.075;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.055, noteStart + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.13);
      oscillator.connect(gain).connect(notificationAudioContext.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + 0.14);
    });
  } catch {
    // A later message retries if the browser has not allowed audio yet.
  }
};
const mapWithConcurrency = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};
const messageAttachmentType = message => String(message?.decryptedAttachment?.type || message?.attachmentType || '').toLowerCase();
const messageMatchesAttachmentFilter = (message, filter) => {
  if (!filter || filter === 'any') return true;
  const type = messageAttachmentType(message);
  if (filter === 'media') return /^(image|video|audio)\//.test(type);
  if (filter === 'document') return Boolean(message.attachmentUrl) && !/^(image|video|audio)\//.test(type);
  if (filter === 'link') return urlsInMessage(message.body).length > 0;
  return true;
};
const inferMimeType = (file) => {
  // A WebM container can hold either audio or video. Recorded voice notes use
  // an explicit filename prefix so they remain audio even when an upload
  // provider later describes the container as video/webm.
  const fileName = String(file?.name || '');
  if (/^voice-message-/i.test(fileName)) {
    if (file?.type?.startsWith('audio/')) return file.type;
    const voiceExtension = fileName.split('.').pop()?.toLowerCase();
    if (['m4a', 'mp4'].includes(voiceExtension)) return 'audio/mp4';
    if (['ogg', 'oga'].includes(voiceExtension)) return 'audio/ogg';
    if (voiceExtension === 'wav') return 'audio/wav';
    if (voiceExtension === 'mp3') return 'audio/mpeg';
    if (voiceExtension === 'aac') return 'audio/aac';
    return 'audio/webm';
  }
  if (file?.type) return file.type;
  const extension = fileName
    .split('.')
    .pop()
    ?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'heif'].includes(extension)) return `image/${extension === 'jpg' ? 'jpeg' : extension}`;
  if (['mp4', 'webm', 'mov'].includes(extension)) return `video/${extension === 'mov' ? 'quicktime' : extension}`;
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(extension)) return `audio/${extension === 'm4a' ? 'mp4' : extension}`;
  if (extension === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
};
const fileVisual = (type, name = '') => {
  const value = `${type || ''} ${name}`.toLowerCase();
  if (value.includes('pdf'))
    return {
      Icon: FileText,
      label: 'PDF document',
      color: 'bg-red-600 text-white',
    };
  if (/word|document|\.docx?\b/.test(value))
    return {
      Icon: FileText,
      label: 'Word document',
      color: 'bg-blue-600 text-white',
    };
  if (/sheet|excel|\.xlsx?\b|\.csv\b/.test(value))
    return {
      Icon: FileSpreadsheet,
      label: 'Spreadsheet',
      color: 'bg-emerald-600 text-white',
    };
  if (/presentation|powerpoint|\.pptx?\b/.test(value))
    return {
      Icon: FileText,
      label: 'Presentation',
      color: 'bg-orange-600 text-white',
    };
  if (/zip|archive/.test(value))
    return {
      Icon: FileArchive,
      label: 'Archive',
      color: 'bg-purple-600 text-white',
    };
  return { Icon: File, label: 'Shared file', color: 'bg-brass/15 text-brass' };
};
const formatBytes = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
const lastSeen = (person) => {
  if (person?.online) return 'online now';
  if (!person?.lastSeenAt) return 'messages are securely stored';
  const when = new Date(person.lastSeenAt);
  return Number.isNaN(when.getTime()) ? 'offline' : `last seen ${when.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`;
};
const conversationName = (conversation, currentUserId) =>
  conversation?.title || conversation?.participants?.find((person) => person.id !== currentUserId)?.name || 'Studio conversation';
const urlBase64ToUint8Array = (value) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = window.atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
};

const formatAudioTime = (value) => {
  const numeric = Number(value);
  const seconds = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const isVoiceAttachment = (attachment = {}) => {
  const type = String(attachment.type || attachment.mime || attachment.file?.type || '').toLowerCase();
  const name = String(attachment.name || attachment.file?.name || '');
  return type.startsWith('audio/') || /^voice-message-.*\.(webm|m4a|mp4|ogg|oga|wav|mp3|aac)$/i.test(name);
};

const VoiceMessagePlayer = memo(function VoiceMessagePlayer({ src, name = 'Voice message', knownDuration = 0 }) {
  const audioRef = useRef(null);
  const animationRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(() => Math.max(0, Number(knownDuration) || 0));
  const [playbackRate, setPlaybackRate] = useState(1);
  const [listened, setListened] = useState(false);
  const [playbackError, setPlaybackError] = useState('');
  const bars = [35, 58, 42, 78, 50, 88, 46, 66, 38, 82, 55, 72, 44, 64, 36, 76, 48, 60, 40, 70, 52, 84, 45, 62];
  const progress = duration ? Math.max(0, Math.min(100, (current / duration) * 100)) : 0;

  const synchronizeDuration = (player) => {
    const mediaDuration = Number(player?.duration);
    if (Number.isFinite(mediaDuration) && mediaDuration > 0) {
      setDuration(mediaDuration);
      return true;
    }
    return false;
  };

  const discoverStreamingDuration = (player) => {
    if (!player || (Number.isFinite(player.duration) && player.duration > 0) || player.readyState < 1) return;
    const originalTime = Number.isFinite(player.currentTime) ? player.currentTime : 0;
    const restore = () => {
      const discovered = Number(player.duration);
      if (Number.isFinite(discovered) && discovered > 0) setDuration(discovered);
      try { player.currentTime = originalTime; } catch { /* The browser will restore it when playable. */ }
      player.removeEventListener('timeupdate', restore);
    };
    player.addEventListener('timeupdate', restore, { once: true });
    try { player.currentTime = Number.MAX_SAFE_INTEGER; } catch { restore(); }
  };

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setPlaybackError('');
    setDuration(Math.max(0, Number(knownDuration) || 0));
  }, [src, knownDuration]);

  useEffect(() => {
    if (!playing) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      return undefined;
    }
    const updateProgress = () => {
      const player = audioRef.current;
      if (player) {
        synchronizeDuration(player);
        setCurrent(Number.isFinite(player.currentTime) ? player.currentTime : 0);
      }
      animationRef.current = requestAnimationFrame(updateProgress);
    };
    animationRef.current = requestAnimationFrame(updateProgress);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [playing]);

  const togglePlayback = async () => {
    const player = audioRef.current;
    if (!player) return;
    if (!player.paused) {
      player.pause();
      setPlaying(false);
      return;
    }
    if (duration && player.currentTime >= duration - 0.05) player.currentTime = 0;
    try {
      setPlaybackError('');
      await player.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
      setPlaybackError('This recording could not be played. Record it again and retry.');
    }
  };

  const seekTo = (value) => {
    const player = audioRef.current;
    if (!player || !duration) return;
    const next = Math.max(0, Math.min(duration, Number(value) || 0));
    player.currentTime = next;
    setCurrent(next);
  };

  const cyclePlaybackRate = () => {
    const next = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  return (
    <div className="flex w-full min-w-0 max-w-full items-center gap-2 rounded-xl bg-black/30 px-2 py-1.5 sm:w-[20rem]">
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onLoadedMetadata={(event) => {
          const player = event.currentTarget;
          if (!synchronizeDuration(player)) {
            setDuration(Math.max(0, Number(knownDuration) || 0));
            discoverStreamingDuration(player);
          }
          setCurrent(event.currentTarget.currentTime || 0);
        }}
        onCanPlay={(event) => {
          if (!synchronizeDuration(event.currentTarget)) discoverStreamingDuration(event.currentTarget);
        }}
        onDurationChange={(event) => synchronizeDuration(event.currentTarget)}
        onTimeUpdate={(event) => {
          synchronizeDuration(event.currentTarget);
          setCurrent(Number.isFinite(event.currentTarget.currentTime) ? event.currentTarget.currentTime : 0);
        }}
        onSeeked={(event) => {
          synchronizeDuration(event.currentTarget);
          setCurrent(Number.isFinite(event.currentTarget.currentTime) ? event.currentTarget.currentTime : 0);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
          setPlaybackError('This recording could not be loaded. Record it again and retry.');
        }}
        onEnded={() => {
          setPlaying(false);
          setListened(true);
          const finalDuration = Number(audioRef.current?.duration);
          setCurrent(Number.isFinite(finalDuration) ? finalDuration : duration);
        }}
      />
      <button
        type="button"
        onClick={togglePlayback}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass text-obsidian transition-transform active:scale-95"
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
      >
        {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="relative flex h-8 w-full touch-none items-center overflow-hidden">
          <div className="flex h-7 w-full items-center justify-between gap-[2px]">
            {bars.map((height, index) => {
              const barProgress = ((index + 1) / bars.length) * 100;
              const isPlayed = barProgress <= progress;
              const isNearPlayhead = playing && Math.abs(barProgress - progress) < 8;
              return (
                <span
                  key={index}
                  className={`w-[3px] min-w-[2px] rounded-full ${isPlayed ? 'bg-brass' : 'bg-ivory/25'}`}
                  style={{
                    height: `${height}%`,
                    transform: isNearPlayhead ? 'scaleY(1.18)' : 'scaleY(1)',
                    transition: 'transform 80ms linear',
                  }}
                />
              );
            })}
          </div>
          <span
            className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-obsidian bg-brass shadow-md"
            style={{ left: `${progress}%` }}
          />
          <input
            type="range"
            min="0"
            max={duration || 0}
            step="0.01"
            value={Math.min(current, duration || 0)}
            onChange={(event) => seekTo(event.target.value)}
            disabled={!duration}
            aria-label={`Seek ${name}`}
            aria-valuetext={`${formatAudioTime(current)} of ${formatAudioTime(duration)}`}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
          />
        </div>
        <div className="flex justify-between text-[10px] text-ivory/45">
          <span>{formatAudioTime(current)}</span>
          <span>{formatAudioTime(duration)}</span>
        </div>
      </div>
      <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brass/10 sm:flex" title={name}>
        {listened ? <CheckCheck size={15} className="text-cyan-400" /> : <Mic size={15} className="text-brass" />}
      </span>
      <button
        type="button"
        onClick={cyclePlaybackRate}
        className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border border-brass/20 bg-obsidian/70 px-1.5 text-[10px] font-semibold text-brass"
        aria-label={`Playback speed ${playbackRate} times`}
      >
        {playbackRate}×
      </button>
      {playbackError && <span role="alert" className="text-[10px] text-red-300" title={playbackError}>!</span>}
    </div>
  );
});

const MAX_VOICE_SECONDS = 5 * 60;
const MAX_VOICE_BYTES = 25 * 1024 * 1024;

function VoiceNoteRecorder({ onCancel, onReady, onSend, viewOnce, onViewOnceChange }) {
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const animationRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const elapsedBeforePauseRef = useRef(0);
  const pointerStartRef = useRef(null);
  const disposedRef = useRef(false);
  const discardRef = useRef(false);
  const finalizingRef = useRef(false);
  const finalizeTimerRef = useRef(null);
  const previewCommittedRef = useRef(false);
  const recordingMimeRef = useRef('audio/webm');
  const [phase, setPhase] = useState('starting');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState(() => Array(34).fill(8));
  const [preview, setPreview] = useState(null);
  const [notice, setNotice] = useState('Preparing microphone…');
  const [locked, setLocked] = useState(false);

  const stopTracks = () => {
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    } catch {
      // A mobile browser may already have released the microphone.
    }
    streamRef.current = null;
    try {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        Promise.resolve(audioContextRef.current.close()).catch(() => {});
      }
    } catch {
      // Closing an already interrupted AudioContext can throw synchronously.
    }
    audioContextRef.current = null;
    try {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    } catch {
      // The animation frame may already have been discarded with the page.
    }
    animationRef.current = null;
  };

  const commitVoicePreview = () => {
    // Do not let a delayed cleanup leave the composer in "Preparing". A
    // deliberate discard is the only case where the preview must not finish.
    if (previewCommittedRef.current || discardRef.current) return;
    previewCommittedRef.current = true;
    finalizingRef.current = false;
    window.clearTimeout(finalizeTimerRef.current);

    try {
      const usableChunks = chunksRef.current.filter((chunk) => chunk?.size);
      // iOS and some Android browsers report a preferred type before they
      // start, then emit chunks in a different supported type. Use the real
      // chunk type so the generated Blob stays playable and uploadable.
      const chunkType = usableChunks.find((chunk) => chunk?.type)?.type;
      const type = String(chunkType || recordingMimeRef.current || 'audio/webm').split(';')[0].toLowerCase();
      if (!usableChunks.length) throw new Error('No audio was captured. Check microphone access and record again.');
      const blob = new Blob(usableChunks, { type });
      stopTracks();

      if (!blob.size) throw new Error('No audio was captured. Check microphone access and record again.');
      if (blob.size > MAX_VOICE_BYTES) throw new Error('This voice note is larger than 25 MB. Please record a shorter note.');

      const extension = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
      const name = `voice-message-${Date.now()}.${extension}`;
      let file;
      try {
        file = new File([blob], name, { type, lastModified: Date.now() });
      } catch {
        // Older iOS/Android webviews can play a Blob but cannot construct File.
        file = blob;
        Object.defineProperty(file, 'name', { configurable: true, value: name });
      }
      Object.defineProperty(file, 'voiceDurationSeconds', { configurable: true, value: Math.max(0, elapsed || 0) });
      const url = URL.createObjectURL(blob);
      setPreview((previous) => {
        if (previous?.url) URL.revokeObjectURL(previous.url);
        return { file, url };
      });
      setPhase('preview');
      setNotice('Preview your voice note before sending.');
    } catch (previewError) {
      previewCommittedRef.current = false;
      stopTracks();
      setPhase('error');
      setNotice(previewError?.message || 'The voice-note preview could not be prepared. Please record again.');
    }
  };

  const finish = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive' || finalizingRef.current) return;
    finalizingRef.current = true;
    setPhase('finalizing');
    setNotice('Preparing your voice-note preview...');
    // Ask for the last encoded chunk, then stop immediately. Delaying stop()
    // leaves some Android MediaRecorder implementations permanently active.
    try {
      recorder.requestData?.();
    } catch {
      // Other implementations flush automatically when stop() is called.
    }
    try {
      if (recorder.state === 'paused') recorder.resume();
      recorder.stop();
    } catch (stopError) {
      finalizingRef.current = false;
      setPhase('error');
      setNotice(stopError?.message || 'The recording could not be finished. Please retry.');
      return;
    }
    // Certain mobile browsers occasionally omit `stop`. The chunks produced
    // by the 250 ms timeslice are still valid, so recover the preview instead
    // of leaving the composer stuck forever.
    window.clearTimeout(finalizeTimerRef.current);
    finalizeTimerRef.current = window.setTimeout(commitVoicePreview, 1200);
  };

  const discard = () => {
    const recorder = recorderRef.current;
    discardRef.current = true;
    recorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    if (preview?.url) URL.revokeObjectURL(preview.url);
    stopTracks();
    onCancel();
  };

  useEffect(() => {
    let disposed = false;
    disposedRef.current = false;
    discardRef.current = false;
    finalizingRef.current = false;
    previewCommittedRef.current = false;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Recording is not supported by this browser.');
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: { ideal: true },
              noiseSuppression: { ideal: true },
              autoGainControl: { ideal: true },
              channelCount: { ideal: 1 },
            },
          });
        } catch {
          // Some iPhone/iPad webviews reject advanced audio constraints even
          // though they can record with the browser defaults.
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const preferred = [
          // Chromium on Android is most reliable with WebM/Opus. Safari does
          // not advertise it and naturally falls through to MP4/M4A.
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus',
          'audio/mp4;codecs=mp4a.40.2',
          'audio/mp4',
        ].find((type) => MediaRecorder.isTypeSupported?.(type));
        const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
        recorderRef.current = recorder;
        recordingMimeRef.current = recorder.mimeType || preferred || 'audio/webm';
        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (!event.data?.size) return;
          if (event.data.type) recordingMimeRef.current = event.data.type;
          chunksRef.current.push(event.data);
        };
        recorder.onerror = (event) => {
          finalizingRef.current = false;
          setPhase('error');
          setNotice(event?.error?.message || 'Recording was interrupted. Please discard it and record again.');
        };
        // Give the final dataavailable event one task to land before building
        // the preview. The watchdog in finish() covers browsers that omit stop.
        recorder.onstop = () => {
          window.clearTimeout(finalizeTimerRef.current);
          window.setTimeout(commitVoicePreview, 0);
        };
        stream.getAudioTracks().forEach((track) => {
          track.onended = () => {
            setNotice('Microphone access ended. Your recorded audio is being prepared.');
            finish();
          };
        });
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          const context = new AudioContextClass();
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.7;
          context.createMediaStreamSource(stream).connect(analyser);
          audioContextRef.current = context;
          if (context.state === 'suspended') await context.resume().catch(() => {});
          const samples = new Uint8Array(analyser.frequencyBinCount);
          let lastSample = 0;
          const draw = (timestamp) => {
            if (timestamp - lastSample > 55 && recorder.state === 'recording') {
              analyser.getByteTimeDomainData(samples);
              const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
              const height = Math.max(8, Math.min(100, Math.round(rms * 360)));
              setLevels((values) => [...values.slice(1), height]);
              lastSample = timestamp;
            }
            animationRef.current = requestAnimationFrame(draw);
          };
          animationRef.current = requestAnimationFrame(draw);
        }
        try {
          recorder.start(250);
        } catch {
          // A few Safari releases reject a timeslice; stop() still provides a
          // valid final audio chunk without one.
          recorder.start();
        }
        startedAtRef.current = performance.now();
        setPhase('recording');
        setNotice('Recording… swipe left to cancel or up to lock.');
      } catch (recordingError) {
        setPhase('error');
        setNotice(recordingError?.message || 'Microphone permission was not granted.');
      }
    };
    start();
    return () => {
      disposed = true;
      disposedRef.current = true;
      window.clearTimeout(finalizeTimerRef.current);
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      stopTracks();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'recording') return undefined;
    const timer = window.setInterval(() => {
      const next = elapsedBeforePauseRef.current + (performance.now() - startedAtRef.current) / 1000;
      setElapsed(next);
      if (next >= MAX_VOICE_SECONDS) {
        setNotice('Five-minute voice-note limit reached. Previewing your recording now.');
        finish();
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && recorderRef.current?.state === 'recording') {
        elapsedBeforePauseRef.current += (performance.now() - startedAtRef.current) / 1000;
        recorderRef.current.pause();
        setPhase('paused');
        setNotice('Recording paused because the app moved to the background.');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const togglePause = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === 'recording') {
      elapsedBeforePauseRef.current += (performance.now() - startedAtRef.current) / 1000;
      recorder.pause();
      setElapsed(elapsedBeforePauseRef.current);
      setPhase('paused');
      setNotice('Recording paused. Listen later, resume, or finish.');
    } else if (recorder.state === 'paused') {
      recorder.resume();
      startedAtRef.current = performance.now();
      setPhase('recording');
      setNotice('Recording resumed.');
    }
  };

  const handlePointerDown = (event) => {
    if (event.target.closest('button,input')) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  };
  const handlePointerUp = (event) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || locked) return;
    if (start.x - event.clientX > 90) discard();
    else if (start.y - event.clientY > 90) {
      setLocked(true);
      setNotice('Recording locked. Use the controls to pause, finish, or delete.');
    }
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      className={`min-w-0 flex-1 rounded-2xl border border-brass/20 bg-obsidian p-3 shadow-xl ${phase !== 'preview' ? 'md:rounded-none md:border-0 md:bg-[#202221] md:p-0 md:shadow-none' : ''}`}
    >
      {phase === 'preview' && preview ? (
        <div className="space-y-3">
          <VoiceMessagePlayer src={preview.url} name={preview.file.name} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={discard} className="flex min-h-10 items-center gap-2 rounded-full border border-red-400/35 px-4 text-xs text-red-300"><Trash2 size={15} /> Delete</button>
            <button type="button" onClick={() => onViewOnceChange(!viewOnce)} className={`flex min-h-10 items-center gap-2 rounded-full border px-4 text-xs ${viewOnce ? 'border-brass bg-brass/10 text-brass' : 'border-brass/20 text-ivory/55'}`}><Eye size={15} /> View once</button>
            <button type="button" onClick={() => onReady(preview.file, preview.url)} className="flex min-h-10 items-center gap-2 rounded-full border border-brass/25 px-4 text-xs font-semibold text-brass">Add caption</button>
            <button type="button" onClick={() => onSend?.(preview.file, preview.url)} className="ml-auto flex min-h-10 items-center gap-2 rounded-full bg-brass px-5 text-xs font-semibold text-obsidian"><Send size={15} /> Send</button>
          </div>
        </div>
      ) : (
        <>
          <div className="md:hidden">
            <div className="flex items-center gap-2 sm:gap-3">
              <button type="button" onClick={discard} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-300" aria-label="Discard voice note"><Trash2 size={19} /></button>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${phase === 'recording' ? 'animate-pulse bg-red-400' : 'bg-brass'}`} />
              <span className="w-11 shrink-0 tabular-nums text-sm text-ivory">{formatAudioTime(elapsed)}</span>
              <div className="flex h-9 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden" aria-label="Live microphone waveform">
                {levels.map((height, index) => <span key={index} className="w-[3px] shrink-0 rounded-full bg-brass transition-[height] duration-75" style={{ height: `${height}%` }} />)}
              </div>
              {(phase === 'recording' || phase === 'paused') && <button type="button" onClick={togglePause} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brass/20 text-brass" aria-label={phase === 'paused' ? 'Resume recording' : 'Pause recording'}>{phase === 'paused' ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}</button>}
              {(phase === 'recording' || phase === 'paused') && <button type="button" onClick={finish} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brass text-obsidian" aria-label="Finish recording"><Send size={18} /></button>}
              {phase === 'finalizing' && <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-brass/25 border-t-brass" aria-label="Preparing voice note" />}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-ivory/40">
              <span className="min-w-0 flex-1 truncate">{notice}</span>
              {locked && <span className="shrink-0 uppercase tracking-wider text-brass">Locked</span>}
            </div>
            <button type="button" onClick={() => onViewOnceChange(!viewOnce)} className={`mt-2 flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[10px] uppercase tracking-wider ${viewOnce ? 'border-brass bg-brass/10 text-brass' : 'border-brass/15 text-ivory/40'}`}><Eye size={12} /> View once</button>
          </div>

          <div className="hidden h-14 min-w-0 items-center gap-4 px-4 md:flex">
            <button type="button" onClick={discard} className="flex h-10 w-10 shrink-0 items-center justify-center text-ivory/70 transition-colors hover:text-red-300" aria-label="Discard voice note" title="Delete recording">
              <Trash2 size={20} />
            </button>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${phase === 'recording' ? 'animate-pulse bg-red-400' : 'bg-brass'}`} aria-hidden="true" />
            <span className="w-12 shrink-0 tabular-nums text-base text-ivory">{formatAudioTime(elapsed)}</span>
            <div className="flex h-8 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden" aria-label="Live microphone waveform">
              {phase === 'error' ? (
                <span role="alert" className="w-full truncate text-xs text-red-300">{notice}</span>
              ) : phase === 'starting' || phase === 'finalizing' ? (
                <span className="flex w-full items-center justify-center gap-2 text-xs text-ivory/45">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-brass/25 border-t-brass" />
                  {notice}
                </span>
              ) : (
                levels.map((height, index) => <span key={index} className="w-[3px] shrink-0 rounded-full bg-ivory/45 transition-[height] duration-75" style={{ height: `${height}%` }} />)
              )}
            </div>
            {(phase === 'recording' || phase === 'paused') && (
              <button type="button" onClick={togglePause} className="flex h-10 w-10 shrink-0 items-center justify-center text-brass transition-colors hover:text-ivory" aria-label={phase === 'paused' ? 'Resume recording' : 'Pause recording'} title={phase === 'paused' ? 'Resume' : 'Pause'}>
                {phase === 'paused' ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => onViewOnceChange(!viewOnce)}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${viewOnce ? 'border-brass bg-brass text-obsidian' : 'border-ivory/35 text-ivory/70 hover:border-brass hover:text-brass'}`}
              aria-label={viewOnce ? 'Disable view once' : 'Enable view once'}
              aria-pressed={viewOnce}
              title="View once"
            >
              1
            </button>
            {(phase === 'recording' || phase === 'paused') && (
              <button type="button" onClick={finish} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brass text-obsidian transition-transform hover:scale-105" aria-label="Finish recording" title="Finish recording">
                <Send size={19} fill="currentColor" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const replyContent = (message) => {
  if (!message) return { label: 'Original message', media: null };
  const attachment = message.decryptedAttachment || (message.attachmentUrl ? {
    type: message.attachmentType,
    name: message.attachmentName,
    url: message.attachmentUrl,
  } : null);
  const type = String(attachment?.type || '').toLowerCase();
  if (message.body) return { label: message.body, media: attachment };
  if (message.sticker) return { label: `${message.sticker} Sticker`, media: null };
  if (message.sharedLocation) return { label: message.sharedLocation.liveUntil ? 'Live location' : 'Location', media: null };
  if (message.sharedContact) return { label: `Contact: ${message.sharedContact.name || 'Contact'}`, media: null };
  if (message.sharedPoll) return { label: `Poll: ${message.sharedPoll.question || 'Poll'}`, media: null };
  if (message.sharedEvent) return { label: `Event: ${message.sharedEvent.title || 'Event'}`, media: null };
  if (type.startsWith('audio/')) return { label: 'Voice message', media: attachment };
  if (type.startsWith('image/')) return { label: 'Photo', media: attachment };
  if (type.startsWith('video/')) return { label: 'Video', media: attachment };
  if (attachment) return { label: attachment.name && attachment.name !== 'encrypted-attachment.bin' ? attachment.name : 'Document', media: attachment };
  return { label: message.replyPreview || 'Original message', media: message.replyMediaPreview || null };
};

function QuotedMessage({ message, target, senderName = 'Reply', onActivate }) {
  const resolved = replyContent(target);
  const media = resolved.media || message?.replyMediaPreview;
  const mediaType = String(media?.type || '').toLowerCase();
  const label = mediaType.startsWith('audio/')
    ? 'Voice message'
    : mediaType.startsWith('image/')
      ? 'Photo'
      : mediaType.startsWith('video/')
        ? 'Video'
        : mediaType.startsWith('application/vnd.reigns.encrypted') || /encrypted-attachment\.bin/i.test(String(media?.name || ''))
          ? 'Attachment'
          : media?.name || message?.replyPreview || 'Message';
  const Wrapper = onActivate ? 'button' : 'div';
  return (
    <Wrapper type={onActivate ? 'button' : undefined} onClick={onActivate} className={`mb-2 flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-r-md border-l-4 border-brass bg-black/25 p-2 text-left text-xs text-ivory/55 ${onActivate ? 'cursor-pointer transition hover:bg-black/40' : ''}`}>
      {mediaType.startsWith('image/') && media?.url && <img src={media.url} alt="Replied image" className="h-11 w-11 shrink-0 rounded object-cover" />}
      {mediaType.startsWith('video/') && (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-black/40 text-brass">
          <Video size={18} />
        </span>
      )}
      {mediaType.startsWith('audio/') && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass/15 text-brass">
          <Mic size={16} />
        </span>
      )}
      {media && !/^(image|video|audio)\//.test(mediaType) && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-brass/10 text-brass">
          <FileText size={16} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[10px] font-semibold text-brass">{senderName}</b>
        <span className="block truncate">{target ? resolved.label : (message?.replyPreview && !/encrypted-attachment\.bin/i.test(message.replyPreview) ? message.replyPreview : label)}</span>
      </span>
    </Wrapper>
  );
}

function EncryptedAttachmentPreview({ attachment, compact, onOpen }) {
  const [resolved, setResolved] = useState(null);
  const [failure, setFailure] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    setResolved(null);
    setFailure('');
    const decryptionKey = `${attachment.messageId}:${attachment.url}:${attachment.encryptedMetadata?.key || ''}:${attachment.encryptedMetadata?.iv || ''}`;
    let decrypting = attachmentDecryptions.get(decryptionKey);
    if (!decrypting) {
      decrypting = fetch(attachment.url, { credentials: 'include', cache: 'force-cache' })
        .then((response) => {
          if (!response.ok) throw new Error('The encrypted attachment could not be downloaded.');
          return response.blob();
        })
        .then((blob) => decryptChatAttachment(blob, attachment.encryptedMetadata))
        .finally(() => attachmentDecryptions.delete(decryptionKey));
      attachmentDecryptions.set(decryptionKey, decrypting);
    }
    decrypting
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResolved({
          ...attachment,
          url: objectUrl,
          previewUrl: objectUrl,
          downloadUrl: objectUrl,
          encryptedMetadata: null,
        });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setFailure(error.message || 'Unable to decrypt this attachment on this device.');
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.messageId, attachment.url, attachment.encryptedMetadata?.key, attachment.encryptedMetadata?.iv]);
  if (failure) return <p className="mt-2 border border-red-500/20 bg-red-950/20 p-3 text-xs text-red-200">{failure}</p>;
  // Technical preparation stays invisible; customers see only the finished item.
  if (!resolved) return <span className="sr-only" role="status" aria-live="polite">Preparing attachment</span>;
  return <AttachmentPreview attachment={resolved} compact={compact} onOpen={onOpen} />;
}

function AttachmentPreview({ attachment, compact = false, onOpen }) {
  if (!attachment?.url) return null;
  if (attachment.encryptedMetadata) return <EncryptedAttachmentPreview attachment={attachment} compact={compact} onOpen={onOpen} />;
  const { url, name, type, bytes } = attachment;
  // Check voice notes before generic WebM video. Some media hosts identify an
  // audio-only WebM container as video/webm, while the voice-message filename
  // remains the reliable signal for recordings made in chat.
  if (isVoiceAttachment(attachment))
    return (
      <div className="mt-1 w-full min-w-0 max-w-full sm:w-[23rem]">
      <VoiceMessagePlayer src={url} name={name} knownDuration={attachment.duration} />
      </div>
    );
  if (type?.startsWith('image/'))
    return (
      <button type="button" onClick={() => onOpen?.(attachment)} className="mt-2 block overflow-hidden border border-brass/15 bg-obsidian text-left">
        <img src={url} alt={name || 'Shared image'} className={`${compact ? 'max-h-40' : 'max-h-72'} w-full object-contain`} />
        {name && (
          <span title={name} className="block truncate px-3 py-2 text-xs text-ivory/60">
            {name}
          </span>
        )}
      </button>
    );
  if (type?.startsWith('video/'))
    return (
      <div className="mt-2 overflow-hidden border border-brass/15 bg-black">
        <video src={url} controls preload="metadata" playsInline className={`${compact ? 'max-h-40' : 'max-h-72'} w-full`} />
        <p className="flex justify-between gap-3 px-3 py-2 text-xs text-ivory/60">
          <span title={name || 'Video'} className="truncate">
            {name || 'Video'}
          </span>
          <span>{formatBytes(bytes)}</span>
        </p>
      </div>
    );
  const { Icon, label, color } = fileVisual(type, name);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(attachment)}
      className="mt-2 flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden border border-brass/15 bg-obsidian p-3 text-left text-xs text-brass"
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center ${color}`}>
        <Icon size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <b title={name || 'Open attachment'} className="block truncate font-medium">
          {name || 'Open attachment'}
        </b>
        <small className="text-ivory/35">
          {label} {formatBytes(bytes) && `· ${formatBytes(bytes)}`}
        </small>
      </span>
      <Download size={16} />
    </button>
  );
}

function LocationPreview({ location, mine, onStop }) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const spread = 0.004;
  const bbox = [longitude - spread, latitude - spread, longitude + spread, latitude + spread].join(',');
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${latitude},${longitude}`)}`;
  const openUrl = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=16/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`;
  const live = location.liveUntil && new Date(location.liveUntil).getTime() > Date.now();
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-brass/15 bg-obsidian">
      <iframe title={live ? 'Live shared location map' : 'Shared location map'} src={mapUrl} loading="lazy" className="h-44 w-full border-0" referrerPolicy="no-referrer" />
      <div className="flex items-center gap-3 p-3 text-sm">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${live ? 'bg-green-500/15 text-green-400' : 'bg-brass/10 text-brass'}`}><MapPin size={19} /></span>
        <span className="min-w-0 flex-1">
          <b className="block text-ivory">{live ? 'Live location' : 'Shared location'}</b>
          <small className="block text-ivory/45">{location.accuracy ? `Accurate to about ${Math.round(location.accuracy)} m` : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}</small>
          {live && <small className="block text-green-400/80">Updated {new Date(location.updatedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>}
        </span>
      </div>
      <div className={`grid border-t border-brass/10 text-xs font-medium text-brass ${live && mine ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <a href={openUrl} target="_blank" rel="noreferrer" className="flex min-h-10 items-center justify-center hover:bg-brass/10">Open full map</a>
        {live && mine && <button type="button" onClick={onStop} className="border-l border-brass/10 text-red-300 hover:bg-red-500/10">Stop sharing</button>}
      </div>
    </div>
  );
}

const LINK_PREVIEW_TTL_MS = 15 * 60 * 1000;
const LINK_PREVIEW_FAILURE_TTL_MS = 30 * 1000;
const linkPreviewCache = new Map();
const firstSecureUrl = body => String(body || '').match(/https?:\/\/[^\s<>{}"']+/i)?.[0]?.replace(/[),.!?]+$/, '') || '';

const loadSecureLinkPreview = url => {
  const current = linkPreviewCache.get(url);
  if (current && current.expiresAt > Date.now()) return current.promise;
  const promise = studioClient.chat.linkPreview(url)
    .then(result => {
      linkPreviewCache.set(url, { promise: Promise.resolve(result), expiresAt: Date.now() + LINK_PREVIEW_TTL_MS });
      return result;
    })
    .catch(error => {
      linkPreviewCache.set(url, { promise: Promise.resolve(null), expiresAt: Date.now() + LINK_PREVIEW_FAILURE_TTL_MS });
      throw error;
    });
  linkPreviewCache.set(url, { promise, expiresAt: Date.now() + LINK_PREVIEW_TTL_MS });
  return promise;
};

function SecureLinkPreview({ body }) {
  const url = firstSecureUrl(body);
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    let active = true;
    setPreview(null);
    if (url) loadSecureLinkPreview(url).then(result => {
      if (active) setPreview(result);
    }).catch(() => {});
    return () => { active = false; };
  }, [url]);
  if (!url || !preview) return null;
  return (
    <a href={preview.url} target="_blank" rel="noreferrer nofollow" className="mt-2 block max-w-md overflow-hidden rounded-xl border border-brass/15 bg-obsidian transition-colors hover:border-brass/35">
      {preview.imageUrl && <img src={preview.imageUrl} alt="" className="max-h-44 w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />}
      <span className="block p-3">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-brass"><ExternalLink size={11} /> {preview.hostname}</span>
        <b className="mt-1 block line-clamp-2 text-sm text-ivory">{preview.title}</b>
        {preview.description && <small className="mt-1 block line-clamp-2 text-ivory/45">{preview.description}</small>}
      </span>
    </a>
  );
}

function PreviewOverlay({ attachment, onClose }) {
  if (!attachment) return null;
  const isPdf = attachment.type?.includes('pdf');
  const previewUrl = attachment.previewUrl || attachment.url;
  const downloadUrl = attachment.downloadUrl || attachment.url;
  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[180] flex items-center justify-center bg-black/90 p-3 backdrop-blur-md sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Attachment preview"
    >
      <div className="flex h-full max-h-[900px] w-full max-w-5xl flex-col border border-brass/25 bg-obsidian shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-brass/15 p-3 sm:p-4">
          <div className="min-w-0">
            <p title={attachment.name || 'Attachment preview'} className="break-all text-sm text-ivory">
              {attachment.name || 'Attachment preview'}
            </p>
            <p className="text-xs text-ivory/35">{formatBytes(attachment.bytes)}</p>
          </div>
          <div className="flex gap-2">
            <a href={downloadUrl} target="_blank" rel="noreferrer" download className="flex h-10 items-center gap-2 border border-brass/20 px-3 text-xs text-brass">
              <Download size={15} />
              <span className="hidden sm:inline">Download file</span>
            </a>
            <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center border border-brass/20 text-ivory">
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 bg-black/40 p-2 sm:p-4">
          {attachment.type?.startsWith('image/') && <img src={previewUrl} alt={attachment.name || 'Shared image'} className="h-full w-full object-contain" />}
          {isPdf && (
            <>
              <iframe src={previewUrl} title={attachment.name || 'PDF preview'} className="hidden h-full w-full bg-white md:block" />
              <div className="flex h-full flex-col items-center justify-center px-5 text-center md:hidden">
                <span className="flex h-20 w-20 items-center justify-center bg-red-600 text-white">
                  <FileText size={38} />
                </span>
                <h3 className="mt-5 max-w-full break-words font-display text-2xl text-ivory">{attachment.name || 'PDF document'}</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-ivory/55">
                  Mobile browsers do not reliably display PDF files inside a page. Open it in your phone's PDF viewer or download a copy.
                </p>
                <div className="mt-6 grid w-full max-w-sm gap-3">
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-12 items-center justify-center gap-2 bg-brass px-4 text-xs uppercase tracking-wider text-obsidian"
                  >
                    <FileText size={16} />
                    Open PDF
                  </a>
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="flex min-h-12 items-center justify-center gap-2 border border-brass/25 px-4 text-xs uppercase tracking-wider text-brass"
                  >
                    <Download size={16} />
                    Download PDF
                  </a>
                </div>
              </div>
            </>
          )}
          {!attachment.type?.startsWith('image/') && !isPdf && (
            <div className="flex h-full items-center justify-center">
              <AttachmentPreview attachment={attachment} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GifPicker({ query, setQuery, results, loading, configured, busy, onSearch, onSend, onClose }) {
  return createPortal(
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[225] flex items-end justify-center bg-black/85 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gif-picker-title"
    >
      <section className="flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden border border-brass/25 bg-carbon shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-brass/15 p-4">
          <div>
            <p className="text-[10px] uppercase tracking-[.25em] text-brass">Animated reactions</p>
            <h3 id="gif-picker-title" className="font-display text-2xl text-ivory">
              Choose a GIF
            </h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close GIF picker" className="flex h-10 w-10 items-center justify-center border border-brass/15">
            <X size={17} />
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-brass/15 p-3 sm:p-4"
        >
          <label className="flex min-w-0 items-center gap-2 border border-brass/20 bg-obsidian px-3">
            <Search size={16} className="shrink-0 text-brass" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search GIFs"
              autoFocus
              className="h-11 min-w-0 flex-1 bg-transparent text-sm text-ivory outline-none"
            />
          </label>
          <button type="submit" disabled={loading || !query.trim()} className="min-h-11 bg-brass px-4 text-xs uppercase tracking-wider text-obsidian disabled:opacity-40">
            Search
          </button>
        </form>
        <div className="min-h-48 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3">
          {loading ? (
            <div className="flex min-h-56 items-center justify-center">
              <Loader2 className="animate-spin text-brass" />
            </div>
          ) : !configured ? (
            <div className="flex min-h-56 items-center justify-center px-6 text-center text-sm text-ivory/50">GIF search is not configured on this deployment yet.</div>
          ) : results.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {results.map((gif) => (
                <button
                  type="button"
                  key={gif.id}
                  disabled={busy}
                  onClick={() => onSend(gif)}
                  title={gif.title || 'Send GIF'}
                  className="group relative aspect-square overflow-hidden bg-obsidian disabled:opacity-40"
                >
                  <img
                    src={gif.previewUrl || gif.url}
                    alt={gif.title || 'GIF result'}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-2 py-1 text-left text-[10px] text-white/80">{gif.title || 'GIF'}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-56 items-center justify-center px-6 text-center text-sm text-ivory/45">Search for a reaction, mood, or art moment.</div>
          )}
        </div>
        <footer className="flex items-center justify-between border-t border-brass/15 px-4 py-3">
          <span className="text-[10px] uppercase tracking-widest text-ivory/35">Tap a GIF to send it</span>
          <strong className="text-xs tracking-wide text-ivory/60">Powered by GIPHY</strong>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function CameraCapture({ onCapture, onClose, onError }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const closeRef = useRef(onClose);
  const errorRef = useRef(onError);
  const [starting, setStarting] = useState(true);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let mounted = true;
    const open = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Your browser does not support direct camera capture.');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 } },
          audio: false,
        });
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (cameraError) {
        const denied = /denied|permission|notallowed/i.test(String(cameraError?.name || cameraError?.message));
        errorRef.current(denied ? 'Camera permission is blocked. Allow camera access in your browser settings and try again.' : (cameraError.message || 'The camera could not start on this phone.'));
        closeRef.current();
      } finally {
        if (mounted) setStarting(false);
      }
    };
    open();
    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const takePhoto = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || capturing) return;
    setCapturing(true);
    try {
      const scale = Math.min(1, 1280 / video.videoWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
      if (!context) throw new Error('This phone could not prepare the camera image. Close other apps and retry.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
      canvas.width = 1;
      canvas.height = 1;
      if (!blob) throw new Error('The photo could not be saved. Free some phone storage and try again.');
      // Older Android WebViews expose Blob but not a constructible File class.
      // A named Blob is accepted by FormData and avoids the minified
      // "... is not a constructor" failure after taking a picture.
      const file = blob;
      Object.defineProperties(file, {
        name: { value: `camera-${Date.now()}.jpg`, configurable: true },
        lastModified: { value: Date.now(), configurable: true },
      });
      await onCapture(file);
      onClose();
    } catch (captureError) {
      onError(captureError.message || 'The photo could not be prepared. Close other apps or free storage, then retry.');
    } finally {
      setCapturing(false);
    }
  };

  return createPortal(
    <section className="fixed inset-0 z-[280] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Camera">
      <header className="flex h-14 shrink-0 items-center justify-between px-3">
        <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50" aria-label="Close camera"><X size={23} /></button>
        <span className="text-sm font-semibold">Camera</span>
        <span className="h-10 w-10" />
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover" />
        {starting && <div className="absolute inset-0 flex items-center justify-center bg-black"><Loader2 className="animate-spin" size={28} /></div>}
      </div>
      <footer className="flex h-24 shrink-0 items-center justify-center pb-[env(safe-area-inset-bottom)]">
        <button type="button" disabled={starting || capturing} onClick={takePhoto} className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/25 disabled:opacity-40" aria-label="Take photo">
          {capturing ? <Loader2 className="animate-spin" /> : <span className="h-12 w-12 rounded-full bg-white" />}
        </button>
      </footer>
    </section>,
    document.body,
  );
}

function AttachmentComposer({
  items,
  activeId,
  setActiveId,
  busy,
  progress,
  onAdd,
  onCaption,
  onCrop,
  onRemove,
  onClose,
  onSend,
}) {
  const activeItem = items.find((item) => item.id === activeId) || items[0];
  if (!activeItem) return null;
  const mime = String(activeItem.mime || activeItem.file?.type || '');
  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');
  const isAudio = mime.startsWith('audio/');
  const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(activeItem.file?.name || '');

  const previewTile = (item) => {
    const itemMime = String(item.mime || item.file?.type || '');
    if (itemMime.startsWith('image/')) return <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />;
    if (itemMime.startsWith('video/')) return <video src={item.previewUrl} muted className="h-full w-full object-cover" />;
    if (itemMime.startsWith('audio/')) return <Mic size={19} />;
    const { Icon, color } = fileVisual(itemMime, item.file?.name);
    return <span className={`flex h-full w-full items-center justify-center ${color}`}><Icon size={24} /></span>;
  };

  return createPortal(
    <section className="fixed inset-0 z-[260] flex min-h-0 flex-col bg-[#101211] text-ivory" role="dialog" aria-modal="true" aria-label="Prepare attachments">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 sm:h-16 sm:px-5">
        <button type="button" disabled={busy} onClick={onClose} aria-label="Close attachment preview" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-40">
          <X size={22} />
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold">{activeItem.file?.name || 'Attachment preview'}</p>
        <div className="flex items-center gap-1">
          {isImage && (
            <button type="button" disabled={busy} onClick={() => onCrop(activeItem.id)} title="Crop square" className={`flex h-10 items-center gap-2 rounded-full px-3 text-xs ${activeItem.cropped ? 'bg-brass/15 text-brass' : 'hover:bg-white/10'}`}>
              <Images size={18} />
              <span className="hidden sm:inline">{activeItem.cropped ? 'Cropped' : 'Crop'}</span>
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => onRemove(activeItem.id)} aria-label="Remove selected attachment" className="flex h-10 w-10 items-center justify-center rounded-full text-red-300 hover:bg-red-400/10 disabled:opacity-40">
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3 sm:p-6">
        {isImage && <img src={activeItem.previewUrl} alt={activeItem.file?.name || 'Selected photo'} className="max-h-full max-w-full object-contain" />}
        {isVideo && <video key={activeItem.id} src={activeItem.previewUrl} controls playsInline className="max-h-full max-w-full object-contain" />}
        {isAudio && (
          <div className="w-full max-w-lg rounded-2xl bg-[#202321] p-6 text-center">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brass/15 text-brass"><Mic size={34} /></span>
            <p className="mt-4 break-words text-sm">{activeItem.file?.name}</p>
            <audio key={activeItem.id} src={activeItem.previewUrl} controls className="mt-5 w-full" />
          </div>
        )}
        {isPdf && <iframe key={activeItem.id} src={activeItem.previewUrl} title={activeItem.file?.name || 'PDF preview'} className="hidden h-full w-full max-w-4xl bg-white md:block" />}
        {isPdf && (
          <div className="flex w-full max-w-md flex-col items-center rounded-2xl bg-[#172126] px-6 py-12 text-center md:hidden">
            <span className="flex h-24 w-24 items-center justify-center rounded-xl bg-red-600 text-white"><FileText size={52} /></span>
            <p className="mt-6 max-w-full break-words text-base">{activeItem.file?.name || 'PDF document'}</p>
            <p className="mt-2 text-sm text-ivory/50">PDF · {formatBytes(activeItem.file?.size)}</p>
          </div>
        )}
        {!isImage && !isVideo && !isAudio && !isPdf && (
          <div className="flex w-full max-w-md flex-col items-center rounded-2xl bg-[#172126] px-6 py-12 text-center">
            {(() => { const { Icon, color } = fileVisual(mime, activeItem.file?.name); return <span className={`flex h-24 w-24 items-center justify-center rounded-xl ${color}`}><Icon size={52} /></span>; })()}
            <p className="mt-6 max-w-full break-words text-base">{activeItem.file?.name || 'Document'}</p>
            <p className="mt-2 text-sm text-ivory/50">No preview available · {formatBytes(activeItem.file?.size)}</p>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#111412] px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl items-center rounded-xl bg-[#252826] px-3">
          <Image size={18} className="shrink-0 text-ivory/45" />
          <input
            value={activeItem.caption || ''}
            disabled={busy}
            maxLength={1000}
            onChange={(event) => onCaption(activeItem.id, event.target.value)}
            placeholder="Add a caption…"
            className="h-12 min-w-0 flex-1 bg-transparent px-3 text-sm text-ivory outline-none placeholder:text-ivory/40"
          />
          <Smile size={19} className="shrink-0 text-ivory/45" />
        </div>

        <div className="mx-auto mt-3 flex w-full max-w-3xl items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {items.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setActiveId(item.id)}
                className={`relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 bg-[#202321] ${item.id === activeItem.id ? 'border-brass' : 'border-transparent text-ivory/65'}`}
                aria-label={`Edit caption for ${item.file?.name || 'attachment'}`}
              >
                {previewTile(item)}
                {item.caption && <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-brass" />}
              </button>
            ))}
            {items.length < 10 && !busy && (
              <label className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/20 text-ivory hover:bg-white/5" aria-label="Add more attachments">
                <Plus size={22} />
                <input type="file" multiple className="hidden" accept="image/*,video/*,audio/*,.heic,.heif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" onChange={(event) => { onAdd(event.target.files); event.target.value = ''; }} />
              </label>
            )}
          </div>
          <button type="button" disabled={busy} onClick={onSend} aria-label="Send attachments" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brass text-obsidian shadow-lg disabled:opacity-50">
            {busy ? <Loader2 size={22} className="animate-spin" /> : <Send size={22} fill="currentColor" />}
          </button>
        </div>
        {busy && (
          <div className="mx-auto mt-2 h-1 w-full max-w-3xl overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-brass transition-all" style={{ width: `${Math.max(...items.map((item) => progress[item.id] || 0), 2)}%` }} />
          </div>
        )}
      </div>
    </section>,
    document.body,
  );
}

export default function ChatWorkspace({ adminMode = false }) {
  const { user } = useAuth();
  const { confirm, confirmDialog } = useGlassConfirm();
  const isIos = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const isInstalledIos = typeof navigator !== 'undefined' && navigator.standalone === true;
  const [conversations, setConversations] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [attachments, setAttachments] = useState([]);
  const [activeAttachmentId, setActiveAttachmentId] = useState('');
  const [preview, setPreview] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState('');
  const [query, setQuery] = useState('');
  const [messageQuery, setMessageQuery] = useState('');
  const [messageSearchFilters, setMessageSearchFilters] = useState({ senderId: '', attachmentType: '', from: '', to: '' });
  const [searchingMessages, setSearchingMessages] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [conversationFilter, setConversationFilter] = useState('all');
  const [queuedCount, setQueuedCount] = useState(0);
  const [showConversationMenu, setShowConversationMenu] = useState(false);
  const [showConversationMore, setShowConversationMore] = useState(false);
  const [conversationMenuPosition, setConversationMenuPosition] = useState(null);
  const [chatAnimationsEnabled, setChatAnimationsEnabled] = useState(() => {
    try { return window.localStorage.getItem('atelier-chat-animations') !== 'off'; } catch { return true; }
  });
  const [messageSelectionMode, setMessageSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState([]);
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
  const [showCameraCapture, setShowCameraCapture] = useState(false);
  const [structuredComposer, setStructuredComposer] = useState(null);
  const [attachmentMenuPosition, setAttachmentMenuPosition] = useState(null);
  const [emojiMenuPosition, setEmojiMenuPosition] = useState(null);
  const [mobileEmojiTab, setMobileEmojiTab] = useState('emoji');
  const [emojiReactionTarget, setEmojiReactionTarget] = useState('');
  const [composerOptionsPosition, setComposerOptionsPosition] = useState(null);
  const [shopPickerOpen, setShopPickerOpen] = useState(false);
  const [resourceKind, setResourceKind] = useState('shop');
  const [shopProducts, setShopProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [shopLoading, setShopLoading] = useState(false);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [gifQuery, setGifQuery] = useState('art reactions');
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifConfigured, setGifConfigured] = useState(true);
  const emptyAnnouncement = {
    title: 'Community Updates',
    body: '',
    audience: 'all',
    scheduledAt: '',
    richMedia: { type: '', title: '', imageUrl: '', url: '' },
    action: { label: '', url: '' },
  };
  const [announcement, setAnnouncement] = useState(emptyAnnouncement);
  const [reporting, setReporting] = useState(false);
  const [report, setReport] = useState({ reason: '', details: '' });
  const [managedUpdates, setManagedUpdates] = useState([]);
  const [moderationReports, setModerationReports] = useState([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [viewOnce, setViewOnce] = useState(false);
  const [disappearAfter, setDisappearAfter] = useState(0);
  const [transcribingId, setTranscribingId] = useState('');
  const [error, setError] = useState('');
  const [connectionState, setConnectionState] = useState('connecting');
  const [encryptionState, setEncryptionState] = useState('starting');
  const [recipientEncryptionState, setRecipientEncryptionState] = useState('checking');
  const [currentCall, setCurrentCall] = useState(null);
  const [callSignals, setCallSignals] = useState([]);
  const [rtcConfig, setRtcConfig] = useState({ iceServers: [], turnConfigured: false });
  const [callHistory, setCallHistory] = useState([]);
  const [showCallHistory, setShowCallHistory] = useState(false);
  const [showSavedBrowser, setShowSavedBrowser] = useState(false);
  const [savedItems, setSavedItems] = useState({ starred: [], media: [] });
  const [savedTab, setSavedTab] = useState('starred');
  const [savedBusy, setSavedBusy] = useState(false);
  const [showChatBrowser, setShowChatBrowser] = useState(false);
  const [chatBrowserTab, setChatBrowserTab] = useState('media');
  const [chatResources, setChatResources] = useState([]);
  const [chatBrowserBusy, setChatBrowserBusy] = useState(false);
  const [securityNotice, setSecurityNotice] = useState('');
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [stories, setStories] = useState([]);
  const [activeStory, setActiveStory] = useState(null);
  const [showStoryComposer, setShowStoryComposer] = useState(false);
  const [storyBody, setStoryBody] = useState('');
  const [storyFile, setStoryFile] = useState(null);
  const [storyPreviewUrl, setStoryPreviewUrl] = useState('');
  const [storyUploadProgress, setStoryUploadProgress] = useState(0);
  const [storyUploadStage, setStoryUploadStage] = useState('');
  const [storyBusy, setStoryBusy] = useState(false);
  const [showGroupBuilder, setShowGroupBuilder] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [groupDirectory, setGroupDirectory] = useState([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState([]);
  const [groupBusy, setGroupBusy] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const messagesPaneRef = useRef(null);
  const attachmentsRef = useRef([]);
  const uploadAbortRef = useRef(null);
  const storyUploadAbortRef = useRef(null);
  const liveLocationWatchesRef = useRef(new Map());
  const photosInputRef = useRef(null);
  const documentsInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const composerRef = useRef(null);
  const typingTimerRef = useRef(null);
  const initializedSelectionRef = useRef(false);
  const typingLastSentRef = useRef({ value: false, at: 0 });
  const activeIdRef = useRef('');
  const latestRefreshRef = useRef('');
  const text = drafts[activeId] || '';
  const queueKey = `reigns-chat-outbox:${user?.id || 'guest'}`;
  const resourceCopy = {
    shop: {
      eyebrow: 'Share for negotiation',
      title: 'Choose Art Shop items',
      description: 'Select one or several products to send in this conversation.',
    },
    gallery: {
      eyebrow: 'Share studio work',
      title: 'Choose gallery artworks',
      description: 'Select one or several artworks to share in this conversation.',
    },
    films: {
      eyebrow: 'Share a process film',
      title: 'Choose Art Films',
      description: 'Select one or several studio films to share in this conversation.',
    },
  }[resourceKind];
  useEffect(() => () => {
    if (storyPreviewUrl) URL.revokeObjectURL(storyPreviewUrl);
  }, [storyPreviewUrl]);
  const setText = (value) =>
    setDrafts((current) => ({
      ...current,
      [activeId]: typeof value === 'function' ? value(current[activeId] || '') : value,
    }));
  const floatingPosition = (element, preferredWidth, preferredHeight) => {
    const rect = element.getBoundingClientRect();
    const gutter = 12;
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportWidth = viewport?.width || window.innerWidth;
    const viewportHeight = viewport?.height || window.innerHeight;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportBottom = viewportTop + viewportHeight;
    const width = Math.min(preferredWidth, viewportWidth - gutter * 2);
    const left = Math.min(viewportRight - width - gutter, Math.max(viewportLeft + gutter, rect.right - width));
    const availableBelow = Math.max(0, viewportBottom - rect.bottom - gutter - 8);
    const availableAbove = Math.max(0, rect.top - viewportTop - gutter - 8);
    const opensBelow = availableBelow >= Math.min(preferredHeight, availableAbove);
    const maxHeight = Math.max(120, Math.min(preferredHeight, opensBelow ? availableBelow : availableAbove));
    const top = opensBelow ? rect.bottom + 8 : Math.max(viewportTop + gutter, rect.top - maxHeight - 8);
    return {
      left,
      top,
      width,
      maxHeight,
    };
  };
  const menuHeight = (desktopMaximum = 440) => Math.min(desktopMaximum, Math.max(280, window.innerHeight * 0.62));
  const closeFloatingMenus = () => {
    setShowAttachmentMenu(false);
    setAttachmentMenuPosition(null);
    setEmojiMenuPosition(null);
    setEmojiReactionTarget('');
    setComposerOptionsPosition(null);
    setShowConversationMenu(false);
    setShowConversationMore(false);
    setConversationMenuPosition(null);
    setMessageMenuId('');
    setMessageMenuPosition(null);
    setReactionPickerId('');
    setReactionPickerPosition(null);
  };
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  useEffect(() => {
    const readQueue = () => {
      try {
        return JSON.parse(window.localStorage.getItem(queueKey) || '[]');
      } catch {
        return [];
      }
    };
    const flushQueue = async () => {
      if (!navigator.onLine) return;
      const pending = readQueue();
      if (!pending.length) return setQueuedCount(0);
      const remaining = [];
      for (const item of pending) {
        try {
          let payload = item.payload;
          if (item.encryptBody) {
            const ciphertext = await encryptChatText(studioClient, {
              body: item.payload.body,
              participantIds: item.participantIds,
              userId: user.id,
            });
            payload = { ...item.payload, body: '', ciphertext, encryption: { algorithm: 'ECDH-P256+AES-256-GCM', version: 1 } };
          }
          await studioClient.chat.send(item.conversationId, payload);
        } catch {
          remaining.push(item);
        }
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
    const closePopovers = (event) => {
      if (event.target?.closest?.('[data-chat-popover]')) return;
      setShowAttachmentMenu(false);
      setEmojiMenuPosition(null);
      setComposerOptionsPosition(null);
      setShowConversationMenu(false);
      setMessageMenuId('');
      setReactionPickerId('');
      setMessageMenuPosition(null);
      setReactionPickerPosition(null);
    };
    const closeWithEscape = (event) => {
      if (event.key !== 'Escape') return;
      closeFloatingMenus();
      setPreview(null);
      setForwardingMessage(null);
      setShopPickerOpen(false);
    };
    document.addEventListener('pointerdown', closePopovers);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closePopovers);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, []);

  const load = async () => {
    let conversationRows;
    let people;
    try {
      [conversationRows, people] = await Promise.all([studioClient.chat.conversations(), studioClient.chat.directory()]);
    } catch (loadError) {
      const cached = await readCachedConversations(user.id).catch(() => null);
      if (cached?.length) setConversations(cached);
      throw loadError;
    }
    const currentProfiles = new Map(people.map((person) => [person.id, person]));
    const hydratedConversations = conversationRows.map((conversation) => ({
      ...conversation,
      participants: (conversation.participants || []).map((person) => ({ ...person, ...(currentProfiles.get(person.id) || {}) })),
    }));
    setConversations(hydratedConversations);
    setDirectory(people);
    cacheConversations(user.id, hydratedConversations).catch(() => {});
    if (!initializedSelectionRef.current && hydratedConversations[0]) {
      initializedSelectionRef.current = true;
      const requestedId = new URLSearchParams(window.location.search).get('conversation');
      setActiveId(hydratedConversations.some((row) => row.id === requestedId) ? requestedId : hydratedConversations[0].id);
    }
  };
  const loadMessages = async (id, search = messageQuery, options = {}) => {
    if (!id) return;
    const showLoadingIndicator = !options.mergeLatest && !options.before;
    if (showLoadingIndicator) setMessagesLoading(true);
    try {
    const pane = messagesPaneRef.current;
    const previousScrollTop = pane?.scrollTop || 0;
    const distanceFromBottom = pane ? pane.scrollHeight - pane.scrollTop - pane.clientHeight : Number.POSITIVE_INFINITY;
    const shouldFollowLatest = options.scrollToBottom || distanceFromBottom < 120;
    let response;
    try {
      response = await studioClient.chat.messages(id, {
        query: search,
        before: options.before || '',
        limit: 60,
        ...(options.filters || {}),
      });
    } catch (loadError) {
      const cached = !search ? await readCachedMessages(user.id, id).catch(() => null) : null;
      if (!cached?.length) throw loadError;
      response = { items: cached, nextCursor: null };
      setConnectionState('offline');
    }
    const encryptedRows = Array.isArray(response) ? response : response.items || [];
    let rows = await decryptMessageRows(encryptedRows, user.id);
    if (search) {
      const normalized = search.toLowerCase();
      rows = rows.filter(message => `${message.body || ''} ${message.decryptedAttachment?.name || message.attachmentName || ''}`.toLowerCase().includes(normalized));
    }
    if (options.filters?.attachmentType) rows = rows.filter(message => messageMatchesAttachmentFilter(message, options.filters.attachmentType));
    if (!search && !options.filters) cacheMessages(user.id, id, encryptedRows).catch(() => {});
    setNextCursor(Array.isArray(response) ? null : response.nextCursor || null);
    setMessages((current) => {
      if (!options.mergeLatest) return rows;
      const confirmedClientIds = new Set(rows.map((item) => item.clientId).filter(Boolean));
      const retained = current.filter((item) => !item.pending || !confirmedClientIds.has(item.clientId));
      return [...new Map([...retained, ...rows].map((item) => [item.id, item])).values()]
        .sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)));
    });
    const hasUnreadIncoming = rows.some((message) => message.senderId !== user.id && !(message.readBy || []).includes(user.id));
    if (hasUnreadIncoming) {
      await studioClient.chat.markRead(id);
      window.dispatchEvent(new CustomEvent('atelier:refresh-badge'));
    }
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const currentPane = messagesPaneRef.current;
        if (!currentPane) return;
        if (options.scrollToTop) currentPane.scrollTop = 0;
        else if (shouldFollowLatest) currentPane.scrollTo({ top: currentPane.scrollHeight, behavior: options.smooth ? 'smooth' : 'auto' });
        else if (options.mergeLatest) currentPane.scrollTop = previousScrollTop;
      }),
    );
    } finally {
      if (showLoadingIndicator) setMessagesLoading(false);
    }
  };
  const refreshLatestMessages = async (id, options = {}) => {
    if (!id || latestRefreshRef.current === id) return;
    latestRefreshRef.current = id;
    try {
      await loadMessages(id, '', { mergeLatest: true, ...options });
    } finally {
      if (latestRefreshRef.current === id) latestRefreshRef.current = '';
    }
  };
  const loadStories = async () => {
    const rows = await studioClient.chat.stories();
    setStories(rows.sort((a, b) => String(a.created_date).localeCompare(String(b.created_date))));
  };

  useEffect(() => {
    let activeEffect = true;
    const initializeSecureChat = async () => {
      try {
        await publishDeviceKeys(studioClient, user.id);
        if (activeEffect) setEncryptionState('ready');
      } catch {
        if (activeEffect) setEncryptionState('unavailable');
      }
    };
    const synchronize = async () => {
      if (!navigator.onLine) return;
      try {
        const cursor = await readSyncCursor(user.id).catch(() => '');
        const synced = await studioClient.chat.sync(cursor || '');
        if (synced.conversations?.length) {
          const cached = await readCachedConversations(user.id).catch(() => []) || [];
          const merged = [...new Map([...cached, ...synced.conversations].map(item => [item.id, item])).values()];
          await cacheConversations(user.id, merged);
        }
        const grouped = (synced.messages || []).reduce((result, message) => {
          (result[message.conversationId] ||= []).push(message);
          return result;
        }, {});
        await Promise.all(Object.entries(grouped).map(async ([conversationId, incoming]) => {
          const cached = await readCachedMessages(user.id, conversationId).catch(() => []) || [];
          const merged = [...new Map([...cached, ...incoming].map(item => [item.id, item])).values()]
            .sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)));
          await cacheMessages(user.id, conversationId, merged);
        }));
        await writeSyncCursor(user.id, synced.cursor);
      } catch {
        // The normal conversation loader continues using the last durable cache.
      }
    };
    const initializeCalls = async () => {
      try {
        const [config, calls] = await Promise.all([studioClient.chat.rtcConfig(), studioClient.chat.calls()]);
        if (!activeEffect) return;
        setRtcConfig(config);
        setCallHistory(calls);
        const requestedCallId = new URLSearchParams(window.location.search).get('call');
        const pending = calls.find(item => item.id === requestedCallId && ['ringing', 'accepted'].includes(item.status))
          || calls.find(item => ['ringing', 'accepted'].includes(item.status));
        if (pending) {
          setCurrentCall(pending);
          setCallSignals(pending.pendingSignals || []);
          setActiveId(pending.conversationId);
          setMobileConversationOpen(true);
        }
      } catch {
        // Calls remain unavailable until the service reconnects.
      }
    };
    initializeSecureChat();
    synchronize();
    initializeCalls();
    window.addEventListener('online', synchronize);
    return () => {
      activeEffect = false;
      window.removeEventListener('online', synchronize);
    };
  }, [user.id]);

  useEffect(() => {
    load()
      .then(() => setConnectionState('connected'))
      .catch((loadError) => {
        setConnectionState('offline');
        setError(loadError.message);
      });
    studioClient.chat.heartbeat().catch(() => {});
    const timer = window.setInterval(() => {
      load()
        .then(() => setConnectionState('connected'))
        .catch(() => setConnectionState('offline'));
      studioClient.chat.heartbeat().catch(() => {});
      if (activeId) refreshLatestMessages(activeId).catch(() => setConnectionState('offline'));
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [activeId]);
  useEffect(() => {
    if (!window.EventSource) return undefined;
    const stream = new EventSource('/api/chat/events', {
      withCredentials: true,
    });
    stream.addEventListener('ready', () => setConnectionState('connected'));
    const refresh = (event) => {
      setConnectionState('connected');
      const payload = JSON.parse(event.data || '{}');
      load().catch(() => setConnectionState('offline'));
      if (payload.conversationId === activeIdRef.current) refreshLatestMessages(payload.conversationId).catch(() => setConnectionState('offline'));
      window.dispatchEvent(new Event('atelier:refresh-badge'));
    };
    const receiveMessage = (event) => {
      const payload = JSON.parse(event.data || '{}');
      refresh(event);
      if (payload.senderId && payload.senderId !== user.id && document.visibilityState === 'visible') playReignsMessageSound();
    };
    stream.addEventListener('message', receiveMessage);
    ['delivery', 'read', 'typing', 'conversation'].forEach((name) => stream.addEventListener(name, refresh));
    const refreshStories = () => loadStories().catch(() => {});
    stream.addEventListener('story', refreshStories);
    const receiveCall = (event) => {
      const payload = JSON.parse(event.data || '{}');
      studioClient.chat.calls().then(setCallHistory).catch(() => {});
      if (payload.action === 'ringing') {
        studioClient.chat.rtcConfig().then(setRtcConfig).catch(() => {});
        setCurrentCall({ ...payload, status: 'ringing', peer: payload.from || payload.peer || null });
        setCallSignals([]);
        setActiveId(payload.conversationId);
        setMobileConversationOpen(true);
      } else {
        setCurrentCall(current => current?.id === payload.callId ? { ...current, status: payload.action } : current);
      }
    };
    const receiveCallSignal = (event) => {
      const payload = JSON.parse(event.data || '{}');
      if (payload.signal) setCallSignals(current => [...current, payload.signal].slice(-100));
    };
    stream.addEventListener('call', receiveCall);
    stream.addEventListener('call-signal', receiveCallSignal);
    stream.onerror = () => setConnectionState('reconnecting');
    return () => {
      stream.removeEventListener('call', receiveCall);
      stream.removeEventListener('call-signal', receiveCallSignal);
      stream.removeEventListener('story', refreshStories);
      stream.removeEventListener('message', receiveMessage);
      stream.close();
    };
  }, []);
  useEffect(() => {
    loadStories().catch(() => {});
    const timer = window.setInterval(() => loadStories().catch(() => {}), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    activeIdRef.current = activeId;
    setMessageSelectionMode(false);
    setSelectedMessageIds([]);
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
    setMessages([]);
    setNextCursor(null);
    setAttachments((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setActiveAttachmentId('');
    loadMessages(activeId, '', { scrollToBottom: true }).catch((loadError) => setError(loadError.message));
  }, [activeId]);
  useEffect(() => {
    if (!activeId || new URLSearchParams(window.location.search).get('compose') !== '1') return;
    setMobileConversationOpen(true);
    const timer = window.setTimeout(() => composerRef.current?.focus(), 180);
    return () => window.clearTimeout(timer);
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
      storyUploadAbortRef.current?.abort();
      liveLocationWatchesRef.current.forEach(({ watchId, timer }) => {
        navigator.geolocation?.clearWatch(watchId);
        window.clearTimeout(timer);
      });
      liveLocationWatchesRef.current.clear();
      attachmentsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  const active = conversations.find((conversation) => conversation.id === activeId);
  const other = active?.participants?.find((person) => person.id !== user.id);
  useEffect(() => {
    let activeEffect = true;
    const checkRecipientDevices = async () => {
      if (!active || active.type === 'announcement') {
        if (activeEffect) setRecipientEncryptionState('standard');
        return;
      }
      const recipientIds = [...new Set((active.participantIds || []).filter(id => id !== user.id))];
      if (!recipientIds.length) {
        if (activeEffect) setRecipientEncryptionState('unavailable');
        return;
      }
      if (activeEffect) setRecipientEncryptionState('checking');
      try {
        await Promise.all(recipientIds.map(id => studioClient.chat.keysFor(id)));
        if (activeEffect) setRecipientEncryptionState('ready');
      } catch {
        if (activeEffect) setRecipientEncryptionState('unavailable');
      }
    };
    checkRecipientDevices();
    return () => { activeEffect = false; };
  }, [active, user.id]);
  const myGroupRole = active?.roles?.[user.id] || '';
  const canManageActiveGroup = active?.type === 'group' && (['owner', 'admin'].includes(myGroupRole) || ['admin', 'editor', 'support'].includes(user.role));
  const canCreateGroups = user?.role === 'admin';
  const openGroupBuilder = async () => {
    if (!canCreateGroups) return;
    setError('');
    try {
      setGroupDirectory(await studioClient.chat.groupDirectory());
      setShowGroupBuilder(true);
    } catch (groupError) {
      setError(groupError.message);
    }
  };
  const createGroup = async (event) => {
    event.preventDefault();
    if (!canCreateGroups || !groupTitle.trim() || !selectedGroupMembers.length) return;
    setGroupBusy(true);
    setError('');
    try {
      const created = await studioClient.chat.createGroup({ title: groupTitle.trim(), participantIds: selectedGroupMembers });
      setGroupTitle('');
      setSelectedGroupMembers([]);
      setShowGroupBuilder(false);
      await load();
      setActiveId(created.id);
      setMobileConversationOpen(true);
    } catch (groupError) {
      setError(groupError.message);
    } finally {
      setGroupBusy(false);
    }
  };
  const updateGroupMember = async (personId, change) => {
    if (!active || !canManageActiveGroup) return;
    setGroupBusy(true);
    try {
      if (change === 'remove') {
        await studioClient.chat.updateGroup(active.id, { participantIds: active.participantIds.filter(id => id !== personId) });
      } else {
        await studioClient.chat.updateGroup(active.id, { userId: personId, role: change });
      }
      await load();
    } catch (groupError) {
      setError(groupError.message);
    } finally {
      setGroupBusy(false);
    }
  };
  const openGroupSettings = async () => {
    setShowGroupSettings(true);
    studioClient.chat.groupDirectory().then(setGroupDirectory).catch(() => {});
  };
  const addGroupMember = async personId => {
    if (!active || !canManageActiveGroup) return;
    setGroupBusy(true);
    try {
      await studioClient.chat.updateGroup(active.id, { participantIds: [...active.participantIds, personId] });
      await load();
    } catch (groupError) {
      setError(groupError.message);
    } finally {
      setGroupBusy(false);
    }
  };
  const renameGroup = async () => {
    if (!active || !canManageActiveGroup) return;
    const title = window.prompt('Group name', active.title || '');
    if (!title?.trim()) return;
    await studioClient.chat.updateGroup(active.id, { title: title.trim() });
    await load();
  };
  const leaveGroup = async () => {
    if (!active || active.type !== 'group') return;
    try {
      await studioClient.chat.updateGroup(active.id, { action: 'leave' });
      setShowGroupSettings(false);
      setActiveId('');
      setMobileConversationOpen(false);
      await load();
    } catch (groupError) {
      setError(groupError.message);
    }
  };
  const createStory = async (event) => {
    event.preventDefault();
    if (!storyBody.trim() && !storyFile) return;
    setStoryBusy(true);
    setStoryUploadProgress(storyFile ? 1 : 100);
    setStoryUploadStage(storyFile ? 'uploading' : 'publishing');
    setError('');
    try {
      let mediaUrl = '';
      let mediaType = '';
      if (storyFile) {
        storyUploadAbortRef.current = new AbortController();
        const uploaded = await studioClient.integrations.Core.UploadFileProgress({
          file: storyFile,
          purpose: 'chat-story',
          signal: storyUploadAbortRef.current.signal,
          onProgress: setStoryUploadProgress,
        });
        mediaUrl = uploaded.file_url;
        mediaType = uploaded.media?.mime || storyFile.type;
      }
      setStoryUploadProgress(100);
      setStoryUploadStage('publishing');
      await studioClient.chat.createStory({ body: storyBody.trim(), mediaUrl, mediaType });
      setStoryBody('');
      setStoryFile(null);
      setStoryPreviewUrl('');
      setShowStoryComposer(false);
      await loadStories();
    } catch (storyError) {
      setError(storyError.name === 'AbortError' ? 'Status upload cancelled.' : storyError.message);
    } finally {
      setStoryBusy(false);
      setStoryUploadProgress(0);
      setStoryUploadStage('');
      storyUploadAbortRef.current = null;
    }
  };
  const selectStoryFile = event => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    if (!/^(image|video)\//.test(file.type)) {
      setError('Choose a photo or video for your status.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`Status media must be smaller than ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }
    setError('');
    setStoryFile(file);
    setStoryPreviewUrl(URL.createObjectURL(file));
  };
  const clearStoryFile = () => {
    setStoryFile(null);
    setStoryPreviewUrl('');
    setStoryUploadProgress(0);
  };
  const openStory = async story => {
    setActiveStory(story);
    if (!story.viewed && !story.mine) {
      studioClient.chat.viewStory(story.id).then(loadStories).catch(() => {});
    }
  };
  const removeActiveStory = async () => {
    if (!activeStory?.mine) return;
    await studioClient.chat.removeStory(activeStory.id);
    setActiveStory(null);
    await loadStories();
  };
  const matchingConversations = useMemo(
    () =>
      conversations.filter((conversation) => {
        if (Boolean(conversation.archived) !== showArchived) return false;
        if (conversationFilter === 'unread' && !conversation.unread) return false;
        if (conversationFilter === 'favourites' && !conversation.favourite) return false;
        if (conversationFilter === 'groups' && !['group', 'announcement'].includes(conversation.type)) return false;
        return `${conversationName(conversation, user.id)} ${conversation.lastMessage || ''}`.toLowerCase().includes(query.toLowerCase());
      }),
    [conversations, conversationFilter, query, showArchived, user.id],
  );
  const existingIds = new Set(conversations.filter((conversation) => conversation.type !== 'announcement').flatMap((conversation) => conversation.participantIds || []));
  const matchingPeople = useMemo(
    () => directory.filter((person) => !existingIds.has(person.id) && `${person.name} ${person.role}`.toLowerCase().includes(query.toLowerCase())),
    [directory, conversations, query],
  );

  const start = async (person) => {
    setError('');
    try {
      const conversation = await studioClient.chat.start(person.id);
      await load();
      setActiveId(conversation.id);
      setMobileConversationOpen(true);
    } catch (startError) {
      setError(startError.message);
    }
  };
  const chooseFiles = async (selectedFiles, { camera = false } = {}) => {
    setError('');
    const selected = [...(selectedFiles || [])];
    if (!selected.length) return;
    const oversized = selected.find((item) => item.size > MAX_FILE_BYTES);
    if (oversized) return setError(`${oversized.name} is larger than the 75 MB limit.`);
    const availableSlots = Math.max(0, 10 - attachments.length);
    try {
      const normalized = await Promise.all(
        selected.slice(0, availableSlots).map(async (item) => {
          const isHeic = /image\/(heic|heif)/i.test(inferMimeType(item)) || /\.(heic|heif)$/i.test(item.name);
          let normalized = item;
          if (isHeic) {
            try {
              const { default: convertHeic } = await import('heic2any');
              const converted = await convertHeic({ blob: item, toType: 'image/jpeg', quality: 0.76 });
              const jpeg = Array.isArray(converted) ? converted[0] : converted;
              normalized = new File([jpeg], item.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg', lastModified: item.lastModified });
            } catch {
              normalized = item;
            }
          }
          if (!String(inferMimeType(normalized) || '').startsWith('image/')) return normalized;
          if (camera && normalized.type === 'image/jpeg' && normalized.size <= 1.2 * 1024 * 1024) return normalized;
          return prepareChatImage(normalized, { camera });
        }),
      );
      const additions = normalized.map((item) => ({
        id: `${Date.now()}-${crypto.randomUUID?.() || Math.random()}`,
        file: item,
        uncroppedFile: item,
        mime: inferMimeType(item),
        previewUrl: URL.createObjectURL(item),
        caption: '',
        cropped: false,
        camera,
      }));
      setAttachments((current) => [...current, ...additions].slice(0, 10));
      if (additions[0]) setActiveAttachmentId(additions[0].id);
      if (selected.length > availableSlots) setError('You can attach up to 10 files to one send.');
    } catch {
      setError('This photo could not be added. Please close other apps and try once more.');
    }
  };
  const removeAttachment = (id) =>
    setAttachments((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      const remaining = current.filter((item) => item.id !== id);
      setActiveAttachmentId((selected) => selected === id ? (remaining[0]?.id || '') : selected);
      return remaining;
    });
  const openResourcePicker = async (kind) => {
    setShowAttachmentMenu(false);
    setShopPickerOpen(true);
    setShopLoading(true);
    setError('');
    setResourceKind(kind);
    try {
      const entity = kind === 'gallery' ? studioClient.entities.Artwork : kind === 'films' ? studioClient.entities.Video : studioClient.entities.ShopProduct;
      const rows = await entity.list('-created_date', 100);
      setShopProducts(
        rows.map((item) => ({
          ...item,
          imageUrl: kind === 'films' ? item.thumbnailUrl : item.imageUrl,
          shareUrl: `${window.location.origin}${kind === 'gallery' ? '/gallery' : kind === 'films' ? '/videos' : '/shop'}`,
          shareLabel: kind === 'gallery' ? 'Gallery artwork' : kind === 'films' ? 'Art Film' : 'Art Shop item',
        })),
      );
    } catch (loadError) {
      setError(loadError.message);
      setShopPickerOpen(false);
    } finally {
      setShopLoading(false);
    }
  };
  const openShopPicker = () => openResourcePicker('shop');
  const searchGifs = async (search = gifQuery) => {
    const normalized = String(search || '').trim();
    if (!normalized) return;
    setGifLoading(true);
    setError('');
    try {
      const result = await studioClient.chat.gifs(normalized);
      setGifConfigured(result.configured !== false);
      setGifResults(Array.isArray(result.items) ? result.items : []);
    } catch (searchError) {
      setError(searchError.message);
      setGifResults([]);
    } finally {
      setGifLoading(false);
    }
  };
  const openGifPicker = () => {
    setShowAttachmentMenu(false);
    setGifPickerOpen(true);
    if (!gifResults.length) searchGifs('art reactions');
  };
  const sendGif = async (gif) => {
    if (!gif?.url || !activeId) return;
    setError('');
    const clientId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const optimisticId = `pending-${clientId}`;
    const sentAt = new Date().toISOString();
    setMessages(current => [...current, {
      id: optimisticId,
      clientId,
      conversationId: activeId,
      senderId: user.id,
      body: '',
      attachmentUrl: gif.url,
      attachmentName: gif.title || 'GIF',
      attachmentType: 'image/gif',
      attachmentBytes: 0,
      pending: true,
      deliveredAt: null,
      readBy: [user.id],
      reactions: {},
      created_date: sentAt,
    }]);
    setGifPickerOpen(false);
    window.requestAnimationFrame(() => {
      const pane = messagesPaneRef.current;
      if (pane) pane.scrollTo({ top: pane.scrollHeight, behavior: 'smooth' });
    });
    try {
      const imported = await studioClient.chat.importGif(gif.id);
      await studioClient.chat.send(activeId, {
        clientId,
        body: '',
        attachmentUrl: imported.file_url,
        attachmentName: imported.media?.filename || gif.title || 'GIF',
        attachmentType: imported.media?.mime || 'image/gif',
        attachmentBytes: imported.media?.bytes || 0,
        allowForward: true,
      });
      refreshLatestMessages(activeId, { scrollToBottom: true, smooth: true }).catch(() => {});
      load().catch(() => {});
    } catch (sendError) {
      setMessages(current => current.map(message => message.id === optimisticId
        ? { ...message, pending: false, failed: true }
        : message));
      setError(sendError.message);
    }
  };
  const sendShopSelection = async () => {
    const chosen = shopProducts.filter((product) => selectedProducts.includes(product.id));
    if (!chosen.length || !activeId) return;
    setBusy(true);
    setError('');
    try {
      await studioClient.chat.sendBatch(
        activeId,
        chosen.map((product, index) => ({
          body: `${index === 0 ? 'I would like to discuss or negotiate these Art Shop items:\n\n' : ''}${product.title}${product.price != null ? ` — GHS ${Number(product.price).toLocaleString('en-GH', { minimumFractionDigits: 2 })}` : ''}\nView in the Art Shop: ${window.location.origin}/shop`,
          ...{
            body: `${index === 0 ? `I would like to share these ${resourceKind === 'gallery' ? 'gallery artworks' : resourceKind === 'films' ? 'Art Films' : 'Art Shop items'}:\n\n` : ''}${product.title}${resourceKind === 'shop' && product.price != null ? ` — GHS ${Number(product.price).toLocaleString('en-GH', { minimumFractionDigits: 2 })}` : ''}\n${product.shareLabel}: ${product.shareUrl}${resourceKind === 'films' && product.videoUrl ? `\nWatch source: ${product.videoUrl}` : ''}`,
          },
          attachmentUrl: product.imageUrl || '',
          attachmentName: product.title,
          attachmentType: product.imageUrl ? 'image/jpeg' : '',
          attachmentBytes: 0,
          allowForward: false,
        })),
      );
      setSelectedProducts([]);
      setShopPickerOpen(false);
      await loadMessages(activeId, '', { scrollToBottom: true });
      await load();
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setBusy(false);
    }
  };
  const sendOutgoing = async ({ body = text.trim(), items = attachments } = {}) => {
    const outgoingText = String(body || '').trim();
    const outgoingAttachments = Array.isArray(items) ? items : [];
    if ((!outgoingText && !outgoingAttachments.length) || !activeId) return false;
    setBusy(true);
    setUploadFailed(false);
    setUploadProgress(Object.fromEntries(outgoingAttachments.map((item) => [item.id, 1])));
    setError('');
    const clientId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const optimisticId = `pending-${clientId}`;
    const optimisticMessages = outgoingAttachments.length
      ? outgoingAttachments.map((item, index) => ({
        id: `${optimisticId}-${index}`, clientId: `${clientId}-${index}`, conversationId: activeId, senderId: user.id,
        body: String(item.caption || '').trim() || (index === 0 ? outgoingText : ''), attachmentUrl: item.previewUrl,
        attachmentName: item.file.name, attachmentType: item.mime || item.file.type || 'application/octet-stream',
        attachmentBytes: item.file.size, voiceDurationSeconds: Number(item.file.voiceDurationSeconds) || 0,
        replyToId: index === 0 ? replyingTo?.id || null : null,
        pending: true, pendingLocalAttachment: true, pendingUploadItemId: item.id,
        deliveredAt: null, readBy: [user.id], reactions: {}, created_date: new Date().toISOString(),
      }))
      : [{
        id: optimisticId, clientId, conversationId: activeId, senderId: user.id,
        body: outgoingText, deliveredAt: null, readBy: [user.id], reactions: {},
        replyToId: replyingTo?.id || null,
        pending: true, created_date: new Date().toISOString(),
      }];
    setMessages(current => [...current, ...optimisticMessages]);
    setText('');
    setAttachments([]);
    setActiveAttachmentId('');
    setReplyingTo(null);
    setViewOnce(false);
    window.requestAnimationFrame(() => {
      const pane = messagesPaneRef.current;
      if (pane) pane.scrollTop = pane.scrollHeight;
    });
    try {
      if (!outgoingAttachments.length) {
        const shouldEncrypt = active?.type !== 'announcement';
        let ciphertext = '';
        let deliverySecurity = shouldEncrypt ? 'end-to-end-encrypted' : 'standard';
        if (shouldEncrypt) {
          try {
            ciphertext = await encryptChatText(studioClient, { body: outgoingText, participantIds: active?.participantIds || [], userId: user.id });
          } catch (encryptionError) {
            const recipientHasNoDevice = /not enabled encrypted messaging|no verified recipient devices/i.test(String(encryptionError.message || ''));
            if (!recipientHasNoDevice) throw encryptionError;
            deliverySecurity = 'account-protected';
          }
        }
        await studioClient.chat.send(activeId, {
          clientId,
          body: ciphertext ? '' : outgoingText,
          ciphertext,
          encryption: ciphertext ? { algorithm: 'ECDH-P256+AES-256-GCM', version: 1 } : null,
          deliverySecurity,
          replyToId: replyingTo?.id || null,
          expiresInSeconds: disappearAfter,
          allowForward: false,
        });
      } else {
        uploadAbortRef.current = new AbortController();
        const messages = await mapWithConcurrency(outgoingAttachments, 3, async (item, index) => {
          const shouldEncrypt = active?.type !== 'announcement';
          const originalType = isVoiceAttachment({ name: item.file.name, type: item.mime || item.file.type })
            ? item.mime || item.file.type || 'audio/webm'
            : item.mime || item.file.type || 'application/octet-stream';
          const originalFile = item.file.type === originalType
            ? item.file
            : new File([item.file], item.file.name, { type: originalType, lastModified: item.file.lastModified });
          let encrypted = null;
          let deliverySecurity = shouldEncrypt ? 'end-to-end-encrypted' : 'standard';
          try {
            encrypted = shouldEncrypt
              ? await encryptChatAttachment(studioClient, {
                file: originalFile,
                body: String(item.caption || '').trim() || (index === 0 ? outgoingText : ''),
                participantIds: active?.participantIds || [],
                userId: user.id,
              })
              : null;
          } catch (encryptionError) {
            const recipientHasNoDevice = /not enabled encrypted messaging|no verified recipient devices/i.test(String(encryptionError.message || ''));
            if (!recipientHasNoDevice) throw encryptionError;
            deliverySecurity = 'account-protected';
          }
          const uploadFile = encrypted?.file || originalFile;
          const uploaded = await studioClient.integrations.Core.UploadFileProgress({
            file: uploadFile,
            purpose: 'chat-attachment',
            signal: uploadAbortRef.current.signal,
            onProgress: (progress) =>
              setUploadProgress((current) => ({
                ...current,
                [item.id]: progress,
              })),
          });
          return {
            clientId: `${clientId}-${index}`,
            body: encrypted ? '' : String(item.caption || '').trim() || (index === 0 ? outgoingText : ''),
            ciphertext: encrypted?.ciphertext || '',
            encryption: encrypted ? { algorithm: 'ECDH-P256+AES-256-GCM', version: 1, attachment: 'AES-256-GCM' } : null,
            deliverySecurity,
            attachmentUrl: uploaded.file_url,
            // Encrypted files keep their metadata inside the device envelope.
            // A protected compatibility fallback keeps the original metadata
            // and is explicitly marked as account-protected, never as E2EE.
            attachmentName: encrypted ? 'encrypted-attachment.bin' : item.file.name,
            attachmentType: encrypted ? 'application/vnd.reigns.encrypted' : uploaded.media?.mime || originalType,
            attachmentBytes: uploadFile.size,
            voiceDurationSeconds: isVoiceAttachment({ name: item.file.name, type: originalType })
              ? Math.max(0, Number(item.file.voiceDurationSeconds) || 0)
              : 0,
            replyToId: index === 0 ? replyingTo?.id || null : null,
            viewOnce,
            expiresInSeconds: disappearAfter,
            allowForward: false,
          };
        });
        await studioClient.chat.sendBatch(activeId, messages);
      }
      setUploadProgress({});
      await loadMessages(activeId, '', { mergeLatest: true, scrollToBottom: true, smooth: true });
      await load();
      outgoingAttachments.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return true;
    } catch (sendError) {
      if (!outgoingAttachments.length && (!navigator.onLine || /fetch|network|offline/i.test(String(sendError.message)))) {
        const queued = {
          conversationId: activeId,
          encryptBody: active?.type !== 'announcement',
          participantIds: active?.participantIds || [],
          payload: {
            clientId: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
            body: outgoingText,
            replyToId: replyingTo?.id || null,
            allowForward: false,
          },
          queuedAt: new Date().toISOString(),
        };
        let pending = [];
        try {
          pending = JSON.parse(window.localStorage.getItem(queueKey) || '[]');
        } catch {
          /* start a clean queue */
        }
        pending.push(queued);
        window.localStorage.setItem(queueKey, JSON.stringify(pending.slice(-100)));
        setQueuedCount(pending.length);
        setText('');
        setReplyingTo(null);
        setError('You are offline. This message is queued and will send automatically when the connection returns.');
        return false;
      }
      setMessages(current => current.filter(message => !optimisticMessages.some(pending => pending.id === message.id)));
      if (outgoingAttachments.length) {
        setAttachments(outgoingAttachments);
        setActiveAttachmentId(outgoingAttachments[0]?.id || '');
      }
      setUploadFailed(Boolean(outgoingAttachments.length) && sendError.name !== 'AbortError');
      setError(sendError.name === 'AbortError' ? 'Upload cancelled. Your files are still ready to retry.' : sendError.message);
      return false;
    } finally {
      setBusy(false);
      uploadAbortRef.current = null;
    }
  };
  const send = () => sendOutgoing();
  const shareLocation = (live = false) => {
    setShowAttachmentMenu(false);
    if (!navigator.geolocation) {
      setError('Location sharing is not supported by this browser.');
      return;
    }
    setBusy(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const message = await studioClient.chat.send(activeId, {
            clientId: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
            body: live ? 'Live location' : 'Shared location',
            sharedLocation: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              liveForSeconds: live ? 3600 : 0,
            },
            expiresInSeconds: disappearAfter,
          });
          if (live) {
            let lastUpdate = 0;
            const watchId = navigator.geolocation.watchPosition(async next => {
              if (Date.now() - lastUpdate < 10_000) return;
              lastUpdate = Date.now();
              try {
                await studioClient.chat.updateLiveLocation(message.id, {
                  latitude: next.coords.latitude,
                  longitude: next.coords.longitude,
                  accuracy: next.coords.accuracy,
                });
              } catch {
                // A later SSE refresh or the one-hour timeout will reconcile state.
              }
            }, () => {}, { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 });
            const timer = window.setTimeout(() => {
              navigator.geolocation.clearWatch(watchId);
              liveLocationWatchesRef.current.delete(message.id);
            }, 60 * 60 * 1000);
            liveLocationWatchesRef.current.set(message.id, { watchId, timer });
          }
          await loadMessages(activeId, '', { scrollToBottom: true });
          await load();
        } catch (shareError) {
          setError(shareError.message);
        } finally {
          setBusy(false);
        }
      },
      () => {
        setBusy(false);
        setError('Location permission was not granted. Allow precise location access and try again.');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  };
  const toggleAttachmentCrop = async (id) => {
    const target = attachments.find(item => item.id === id);
    if (!target || !String(target.mime || '').startsWith('image/')) return;
    try {
      const nextCropped = !target.cropped;
      const nextFile = nextCropped ? await prepareChatImage(target.uncroppedFile || target.file, { square: true }) : (target.uncroppedFile || target.file);
      const nextPreviewUrl = URL.createObjectURL(nextFile);
      setAttachments(current => current.map(item => {
        if (item.id !== id) return item;
        URL.revokeObjectURL(item.previewUrl);
        return { ...item, file: nextFile, mime: nextFile.type, previewUrl: nextPreviewUrl, cropped: nextCropped };
      }));
    } catch {
      setError('This photo could not be cropped on this device. You can still send the prepared photo.');
    }
  };
  const stopLiveLocation = async message => {
    const activeWatch = liveLocationWatchesRef.current.get(message.id);
    if (activeWatch) {
      navigator.geolocation.clearWatch(activeWatch.watchId);
      window.clearTimeout(activeWatch.timer);
      liveLocationWatchesRef.current.delete(message.id);
    }
    await studioClient.chat.updateLiveLocation(message.id, { stop: true });
    await loadMessages(activeId, '', { mergeLatest: true });
  };
  const shareContact = async () => {
    setShowAttachmentMenu(false);
    const name = window.prompt('Contact name');
    if (!name) return;
    const phone = window.prompt('Phone number (include country code)');
    const email = window.prompt('Email address (optional)') || '';
    if (!phone && !email) return;
    try {
      await studioClient.chat.send(activeId, {
        clientId: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        sharedContact: { name, phone, email },
        expiresInSeconds: disappearAfter,
      });
      await loadMessages(activeId, '', { scrollToBottom: true });
      await load();
    } catch (shareError) {
      setError(shareError.message);
    }
  };
  const transcribeMessage = async (message) => {
    setTranscribingId(message.id);
    setError('');
    try {
      await studioClient.chat.transcribe(message.id, 'auto');
      setError('Transcription requested. It will appear when the speech service finishes.');
    } catch (transcribeError) {
      setError(transcribeError.message);
    } finally {
      setTranscribingId('');
    }
  };
  const beginCall = async (kind) => {
    try {
      const config = await studioClient.chat.rtcConfig();
      const call = await studioClient.chat.startCall({ conversationId: activeId, kind });
      setRtcConfig(config);
      setCallSignals([]);
      setCurrentCall({ ...call, peer: other || call.peer });
      if (!config.turnConfigured) setError('The call is starting with direct WebRTC connectivity. Configure TURN for reliable production calls.');
    } catch (callError) {
      setError(callError.message);
    }
  };
  const sendStructuredMessage = async (kind, form) => {
    setBusy(true);
    setError('');
    try {
      const payload = kind === 'poll'
        ? { sharedPoll: { question: form.question, options: form.options.filter(option => option.trim()) } }
        : { sharedEvent: { title: form.title, startsAt: form.startsAt, endsAt: form.endsAt || null, location: form.location, notes: form.notes } };
      await studioClient.chat.send(activeId, {
        clientId: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        ...payload,
        expiresInSeconds: disappearAfter,
      });
      setStructuredComposer(null);
      await loadMessages(activeId, '', { mergeLatest: true, scrollToBottom: true, smooth: true });
      await load();
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setBusy(false);
    }
  };
  const voteInPoll = async (messageId, optionIndex) => {
    try {
      const sharedPoll = await studioClient.chat.votePoll(messageId, optionIndex);
      setMessages(current => current.map(item => item.id === messageId ? { ...item, sharedPoll } : item));
    } catch (voteError) {
      setError(voteError.message);
    }
  };
  const acceptCall = async callId => {
    const updated = await studioClient.chat.updateCall(callId, { action: 'accepted' });
    setCurrentCall(current => current?.id === callId ? { ...current, ...updated, peer: current.peer || updated.peer } : current);
  };
  const closeCall = () => {
    setCurrentCall(null);
    setCallSignals([]);
    studioClient.chat.calls().then(setCallHistory).catch(() => {});
  };
  const setForwarding = async (message) => {
    await studioClient.chat.setForwarding(message.id, !message.allowForward);
    await loadMessages(activeId, '', { mergeLatest: true });
  };
  const forwardMessage = async (conversationId) => {
    if (!forwardingMessage) return;
    setBusy(true);
    setError('');
    try {
      await studioClient.chat.forward(forwardingMessage.id, conversationId);
      setForwardingMessage(null);
      setActiveId(conversationId);
      await load();
    } catch (forwardError) {
      setError(forwardError.message);
    } finally {
      setBusy(false);
    }
  };
  const react = async (message, emoji) => {
    await studioClient.chat.react(message.id, message.reactions?.[user.id] === emoji ? '' : emoji);
    await loadMessages(activeId, '', { mergeLatest: true });
  };
  const starMessage = async (message) => {
    await studioClient.chat.star(message.id, !(message.starredBy || []).includes(user.id));
    await loadMessages(activeId, '', { mergeLatest: true });
  };
  const pinMessage = async message => {
    const updated = await studioClient.chat.pin(message.id, !message.pinned);
    setMessages(current => current.map(item => item.id === message.id ? { ...item, ...updated } : item));
  };
  const saveMedia = async message => {
    await studioClient.chat.saveMedia(message.id, !(message.savedMediaBy || []).includes(user.id));
    await loadMessages(activeId, '', { mergeLatest: true });
  };
  const openSavedBrowser = async () => {
    setShowSavedBrowser(true);
    setSavedBusy(true);
    try {
      const result = await studioClient.chat.savedItems();
      const decrypted = await decryptMessageRows([...(result.starred || []), ...(result.media || [])], user.id);
      const byId = new Map(decrypted.map(item => [item.id, item]));
      setSavedItems({
        starred: (result.starred || []).map(item => byId.get(item.id) || item),
        media: (result.media || []).map(item => byId.get(item.id) || item),
      });
    } catch (savedError) {
      setError(savedError.message);
    } finally {
      setSavedBusy(false);
    }
  };
  const sendSticker = async sticker => {
    if (!activeId || busy) return;
    setBusy(true);
    setShowStickerPicker(false);
    try {
      await studioClient.chat.send(activeId, {
        clientId: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        sticker,
        expiresInSeconds: disappearAfter,
      });
      await loadMessages(activeId, '', { scrollToBottom: true });
      await load();
    } catch (stickerError) {
      setError(stickerError.message);
    } finally {
      setBusy(false);
    }
  };
  const saveEdit = async () => {
    if (!editing?.body?.trim()) return;
    setBusy(true);
    try {
      let payload = { body: editing.body };
      if (editing.encrypted) {
        const ciphertext = await encryptChatText(studioClient, { body: editing.body, participantIds: active?.participantIds || [], userId: user.id });
        payload = { body: '', ciphertext };
      }
      await studioClient.chat.edit(editing.id, payload);
      setEditing(null);
      await loadMessages(activeId, '', { mergeLatest: true });
      await load();
    } catch (editError) {
      setError(editError.message);
    } finally {
      setBusy(false);
    }
  };
  const removeMessage = async (message, mode) => {
    const previousMessages = messages;
    setMessageMenuId('');
    setMessages(current => current.filter(item => item.id !== message.id));
    try {
      await studioClient.chat.remove(message.id, mode);
      load().catch(() => {});
    } catch (removeError) {
      setMessages(previousMessages);
      setError(removeError.message);
    }
  };
  const updateConversation = async (changes) => {
    try {
      const updated = await studioClient.chat.settings(activeId, changes);
      setConversations((rows) => rows.map((row) => (row.id === activeId ? updated : row)));
      if (changes.archived) setActiveId('');
      setShowConversationMenu(false);
    } catch (settingsError) {
      setError(settingsError.message);
    }
  };
  const updateTyping = (value) => {
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
  const runMessageSearch = async (event) => {
    event?.preventDefault();
    setSearchBusy(true);
    try {
      await loadMessages(activeId, messageQuery, { scrollToTop: true, filters: messageSearchFilters });
    } catch (searchError) {
      setError(searchError.message);
    } finally {
      setSearchBusy(false);
    }
  };
  const clearConversationMessages = async messageIds => {
    const selectedCount = messageIds?.length || 0;
    const approved = await confirm({
      title: selectedCount ? `Delete ${selectedCount} selected message${selectedCount === 1 ? '' : 's'}?` : 'Clear this chat?',
      description: selectedCount
        ? 'The selected messages will be removed from your view. Other participants will keep their copies.'
        : 'Every message in this conversation will be removed from your view. Other participants will keep their copies.',
      confirmLabel: selectedCount ? 'Delete selected' : 'Clear chat',
    });
    if (!approved) return;
    const previousMessages = messages;
    const selectedIds = new Set(messageIds || []);
    setMessages(current => selectedCount ? current.filter(message => !selectedIds.has(message.id)) : []);
    setBusy(true);
    setError('');
    try {
      await studioClient.chat.clearMessages(activeId, selectedCount ? messageIds : null);
      setSelectedMessageIds([]);
      setMessageSelectionMode(false);
      setShowConversationMenu(false);
      load().catch(() => {});
    } catch (clearError) {
      setMessages(previousMessages);
      setError(clearError.message);
    } finally {
      setBusy(false);
    }
  };
  const openChatBrowser = async (tab = 'media') => {
    if (!activeId) return;
    setShowConversationMenu(false);
    setMessageSelectionMode(false);
    setSelectedMessageIds([]);
    setChatBrowserTab(tab);
    setShowChatBrowser(true);
    setChatBrowserBusy(true);
    setError('');
    try {
      setChatResources(await decryptMessageRows(await studioClient.chat.resources(activeId), user.id));
    } catch (browserError) {
      setError(browserError.message);
      setShowChatBrowser(false);
    } finally {
      setChatBrowserBusy(false);
    }
  };
  const exportConversation = async () => {
    if (!activeId) return;
    setShowConversationMenu(false);
    setBusy(true);
    setError('');
    try {
      const payload = await studioClient.chat.exportConversation(activeId);
      payload.messages = await decryptMessageRows(payload.messages || [], user.id);
      payload.messages = payload.messages.map(({ ciphertext, encryption, decryptedAttachment, ...message }) => ({
        ...message,
        attachment: decryptedAttachment || (message.attachmentUrl ? { name: message.attachmentName, type: message.attachmentType, bytes: message.attachmentBytes } : null),
        encryptionStatus: ciphertext ? (message.encryptionError ? 'unavailable-on-this-device' : 'decrypted-for-export') : (message.deliverySecurity || 'standard'),
      }));
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `reigns-chat-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError.message);
    } finally {
      setBusy(false);
    }
  };
  const loadOlderMessages = async () => {
    if (!activeId || !nextCursor || loadingOlder) return;
    const pane = messagesPaneRef.current;
    const previousHeight = pane?.scrollHeight || 0;
    setLoadingOlder(true);
    try {
      const response = await studioClient.chat.messages(activeId, {
        before: nextCursor,
        limit: 60,
      });
      const older = await decryptMessageRows(response.items || [], user.id);
      setMessages((current) => [...older, ...current]);
      setNextCursor(response.nextCursor || null);
      window.requestAnimationFrame(() => {
        if (pane) pane.scrollTop = pane.scrollHeight - previousHeight;
      });
    } catch (olderError) {
      setError(olderError.message);
    } finally {
      setLoadingOlder(false);
    }
  };
  const handleMessageScroll = (event) => {
    const pane = event.currentTarget;
    setShowJumpToLatest(pane.scrollHeight - pane.scrollTop - pane.clientHeight > 220);
  };
  const jumpToLatest = () => {
    const pane = messagesPaneRef.current;
    if (pane) {
      pane.scrollTo({ top: pane.scrollHeight, behavior: 'smooth' });
      setShowJumpToLatest(false);
    }
  };
  const jumpToRepliedMessage = async (messageId) => {
    if (!messageId) return;
    let target = messages.find(item => item.id === messageId);
    if (!target) {
      try {
        const [resolved] = await decryptMessageRows([await studioClient.chat.message(messageId)], user.id);
        target = resolved;
        setMessages(current => [...current, resolved]
          .filter((item, index, rows) => rows.findIndex(candidate => candidate.id === item.id) === index)
          .sort((left, right) => new Date(left.created_date) - new Date(right.created_date)));
      } catch (jumpError) {
        setError(jumpError.message || 'The original message is no longer available.');
        return;
      }
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const element = document.querySelector(`[data-chat-message-id="${CSS.escape(messageId)}"]`);
      if (!element) return;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(messageId);
      window.setTimeout(() => setHighlightedMessageId(current => current === messageId ? '' : current), 1800);
    }));
  };
  const enablePush = async () => {
    try {
      if (isIos && !isInstalledIos) throw new Error('On iPhone, first add Reigns Atelier to your Home Screen, open the installed app, then enable alerts here.');
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
      if (!subscription)
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey),
        });
      await studioClient.push.subscribe(subscription.toJSON());
      setPushState('enabled');
    } catch (pushError) {
      setPushState('error');
      setError(pushError.message);
    }
  };
  const publishAnnouncement = async () => {
    if (!announcement.body.trim()) return;
    setBusy(true);
    try {
      const update = await studioClient.chat.announce(announcement);
      setAnnouncement(emptyAnnouncement);
      setShowAnnouncement(false);
      await load();
      if (adminMode) setManagedUpdates(await studioClient.chat.announcements());
      if (update.conversationId) setActiveId(update.conversationId);
    } catch (announcementError) {
      setError(announcementError.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!adminMode || user?.role !== 'admin') return;
    Promise.all([studioClient.chat.announcements(), studioClient.chat.reports()])
      .then(([updates, reports]) => {
        setManagedUpdates(updates);
        setModerationReports(reports);
      })
      .catch((loadError) => setError(loadError.message));
  }, [adminMode, user?.role]);
  const submitReport = async (event) => {
    event.preventDefault();
    if (!activeId || !report.reason.trim()) return;
    setBusy(true);
    try {
      await studioClient.chat.report(activeId, report);
      setReport({ reason: '', details: '' });
      setReporting(false);
      setError('Your report was sent privately to Studio Control.');
    } catch (reportError) {
      setError(reportError.message);
    } finally {
      setBusy(false);
    }
  };
  const reviewReport = async (id, status) => {
    const updated = await studioClient.chat.reviewReport(id, { status });
    setModerationReports((rows) => rows.map((item) => (item.id === id ? updated : item)));
  };
  const toggleRecording = () => {
    setError('');
    setRecording((value) => !value);
  };
  const cancelRecording = () => setRecording(false);
  const createRecordedVoiceAttachment = (voiceFile, previewUrl) => ({
    id: `voice-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file: voiceFile,
    mime: voiceFile.type || 'audio/webm',
    previewUrl,
  });
  const attachRecordedVoice = (voiceFile, previewUrl) => {
    const voiceAttachment = createRecordedVoiceAttachment(voiceFile, previewUrl);
    setAttachments((current) => [...current, voiceAttachment]);
    setActiveAttachmentId(voiceAttachment.id);
    setRecording(false);
  };
  const sendRecordedVoice = async (voiceFile, previewUrl) => {
    const voiceAttachment = createRecordedVoiceAttachment(voiceFile, previewUrl);
    setRecording(false);
    await sendOutgoing({ body: '', items: [voiceAttachment] });
  };

  return (
    <>
      {confirmDialog}
      {showCameraCapture && (
        <CameraCapture
          onClose={() => setShowCameraCapture(false)}
          onError={setError}
          onCapture={(file) => chooseFiles([file], { camera: true })}
        />
      )}
      {attachments.length > 0 && !recording && (
        <AttachmentComposer
          items={attachments}
          activeId={activeAttachmentId}
          setActiveId={setActiveAttachmentId}
          busy={busy}
          progress={uploadProgress}
          onAdd={chooseFiles}
          onCaption={(id, caption) => setAttachments((current) => current.map((item) => item.id === id ? { ...item, caption } : item))}
          onCrop={toggleAttachmentCrop}
          onRemove={removeAttachment}
          onClose={() => {
            attachments.forEach((item) => URL.revokeObjectURL(item.previewUrl));
            setAttachments([]);
            setActiveAttachmentId('');
            setUploadFailed(false);
          }}
          onSend={send}
        />
      )}
      <div
        className={`grid min-h-0 max-w-full overflow-hidden bg-carbon lg:grid-cols-[minmax(280px,350px)_minmax(0,1fr)] ${adminMode ? 'h-[clamp(360px,calc(100dvh-13rem),760px)] md:border md:border-brass/15' : 'h-full'}`}
      >
        <aside className={`${mobileConversationOpen ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-col overflow-hidden border-r border-brass/15`}>
          <div className="shrink-0 border-b border-brass/15 p-4">
            {!adminMode && (
              <Link
                to="/"
                aria-label="Return to the main site"
                title="Back to the main site"
                className="mb-3 inline-flex min-h-8 items-center gap-2 rounded-full border border-brass/25 bg-brass/5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-brass transition hover:border-brass/60 hover:bg-brass hover:text-obsidian focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/60"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                <span>Main site</span>
              </Link>
            )}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-display text-2xl text-ivory">{adminMode ? 'Studio conversations' : 'Messages'}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {canCreateGroups && (
                  <button
                    type="button"
                    onClick={openGroupBuilder}
                    aria-label="Create a group"
                    title="Create a group"
                    className="flex h-9 w-9 items-center justify-center border border-brass/15 text-brass"
                  >
                    <Users size={15} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={openSavedBrowser}
                  aria-label="Open starred messages and saved media"
                  title="Starred and saved"
                  className="flex h-9 w-9 items-center justify-center border border-brass/15 text-brass"
                >
                  <Bookmark size={15} />
                </button>
                <button
                  type="button"
                  onClick={enablePush}
                  aria-label={pushState === 'enabled' ? 'Disable push alerts' : 'Enable push alerts'}
                  title={pushState === 'enabled' ? 'Disable push alerts' : 'Enable push alerts'}
                  className={`flex h-9 w-9 items-center justify-center border ${pushState === 'enabled' ? 'border-green-400/30 text-green-400' : 'border-brass/15 text-brass'}`}
                >
                  <Bell size={15} />
                </button>
                {adminMode && user?.role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => setShowAnnouncement((value) => !value)}
                    aria-label="Post a community update"
                    title="Post a community update"
                    className="flex h-9 w-9 items-center justify-center border border-brass/15 text-brass"
                  >
                    <Megaphone size={15} />
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1 text-xs text-ivory/35">{adminMode ? 'Private studio and customer conversations' : 'Private conversations with studio administrators'}</p>
            {isIos && !isInstalledIos && (
              <p className="mt-2 text-[10px] leading-4 text-brass/70">iPhone alerts: Share → Add to Home Screen, then open the installed app and tap the bell.</p>
            )}
            <label className="mt-4 flex h-11 items-center gap-2 border border-brass/15 bg-obsidian px-3 text-ivory/55">
              <Search size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search people or chats"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => setShowArchived((value) => !value)}
              className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-ivory/40 hover:text-brass"
            >
              <Archive size={13} />
              {showArchived ? 'Show active chats' : 'Archived chats'}
            </button>
            <div className="mt-3 flex max-w-full gap-1 overflow-x-auto pb-1">
              {[
                ['all', 'All'],
                ['unread', 'Unread'],
                ['favourites', 'Favourites'],
                ['groups', 'Groups'],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setConversationFilter(value)}
                  className={`min-h-8 shrink-0 rounded-full border px-3 text-[10px] uppercase tracking-wider ${conversationFilter === value ? 'border-brass bg-brass/15 text-brass' : 'border-brass/10 text-ivory/40'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {queuedCount > 0 && (
              <p className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-amber-300">
                <WifiOff size={12} />
                {queuedCount} queued message{queuedCount === 1 ? '' : 's'} will retry automatically
              </p>
            )}
            {showAnnouncement && user?.role === 'admin' && (
              <div className="mt-3 max-h-[55dvh] space-y-2 overflow-y-auto border border-brass/15 bg-obsidian p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-brass">Community Updates</p>
                <p className="text-xs leading-5 text-ivory/45">Publish now or schedule an update for a selected audience.</p>
                <input
                  value={announcement.title}
                  onChange={(event) =>
                    setAnnouncement((value) => ({
                      ...value,
                      title: event.target.value,
                    }))
                  }
                  className="h-10 w-full border border-brass/15 bg-carbon px-3 text-sm text-ivory"
                  placeholder="Update title"
                />
                <textarea
                  value={announcement.body}
                  onChange={(event) =>
                    setAnnouncement((value) => ({
                      ...value,
                      body: event.target.value,
                    }))
                  }
                  className="h-24 w-full resize-none border border-brass/15 bg-carbon p-3 text-sm text-ivory"
                  placeholder="Write the update"
                />
                <select
                  value={announcement.audience}
                  onChange={(event) =>
                    setAnnouncement((value) => ({
                      ...value,
                      audience: event.target.value,
                    }))
                  }
                  className="h-10 w-full border border-brass/15 bg-carbon px-3 text-sm text-ivory"
                >
                  <option value="all">Everyone</option>
                  <option value="customers">Customers</option>
                  <option value="partners">Partners</option>
                  <option value="interns">Interns</option>
                  <option value="staff">Staff</option>
                </select>
                <input
                  type="datetime-local"
                  value={announcement.scheduledAt}
                  onChange={(event) =>
                    setAnnouncement((value) => ({
                      ...value,
                      scheduledAt: event.target.value,
                    }))
                  }
                  className="h-10 w-full border border-brass/15 bg-carbon px-3 text-sm text-ivory"
                  aria-label="Schedule date and time"
                />
                <select
                  value={announcement.richMedia.type}
                  onChange={(event) =>
                    setAnnouncement((value) => ({
                      ...value,
                      richMedia: {
                        ...value.richMedia,
                        type: event.target.value,
                      },
                    }))
                  }
                  className="h-10 w-full border border-brass/15 bg-carbon px-3 text-sm text-ivory"
                >
                  <option value="">No rich media</option>
                  <option value="image">Image</option>
                  <option value="product">Art Shop product</option>
                  <option value="film">Art Film</option>
                </select>
                {announcement.richMedia.type && (
                  <>
                    <input
                      value={announcement.richMedia.title}
                      onChange={(event) =>
                        setAnnouncement((value) => ({
                          ...value,
                          richMedia: {
                            ...value.richMedia,
                            title: event.target.value,
                          },
                        }))
                      }
                      className="h-10 w-full border border-brass/15 bg-carbon px-3 text-sm text-ivory"
                      placeholder="Media title"
                    />
                    <input
                      value={announcement.richMedia.imageUrl}
                      onChange={(event) =>
                        setAnnouncement((value) => ({
                          ...value,
                          richMedia: {
                            ...value.richMedia,
                            imageUrl: event.target.value,
                          },
                        }))
                      }
                      className="h-10 w-full border border-brass/15 bg-carbon px-3 text-sm text-ivory"
                      placeholder="Image URL"
                    />
                    <input
                      value={announcement.richMedia.url}
                      onChange={(event) =>
                        setAnnouncement((value) => ({
                          ...value,
                          richMedia: {
                            ...value.richMedia,
                            url: event.target.value,
                          },
                        }))
                      }
                      className="h-10 w-full border border-brass/15 bg-carbon px-3 text-sm text-ivory"
                      placeholder="Destination URL"
                    />
                  </>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={announcement.action.label}
                    onChange={(event) =>
                      setAnnouncement((value) => ({
                        ...value,
                        action: { ...value.action, label: event.target.value },
                      }))
                    }
                    className="h-10 min-w-0 border border-brass/15 bg-carbon px-3 text-sm text-ivory"
                    placeholder="Button label"
                  />
                  <input
                    value={announcement.action.url}
                    onChange={(event) =>
                      setAnnouncement((value) => ({
                        ...value,
                        action: { ...value.action, url: event.target.value },
                      }))
                    }
                    className="h-10 min-w-0 border border-brass/15 bg-carbon px-3 text-sm text-ivory"
                    placeholder="Button URL"
                  />
                </div>
                <button
                  type="button"
                  disabled={busy || !announcement.body.trim()}
                  onClick={publishAnnouncement}
                  className="h-10 w-full bg-brass text-xs uppercase tracking-wider text-obsidian disabled:opacity-40"
                >
                  {announcement.scheduledAt ? 'Schedule update' : 'Post update now'}
                </button>
                {managedUpdates.length > 0 && (
                  <div className="space-y-2 border-t border-brass/10 pt-3">
                    <p className="text-[10px] uppercase tracking-widest text-ivory/40">Recent & scheduled</p>
                    {managedUpdates.slice(0, 6).map((update) => (
                      <article key={update.id} className="border border-brass/10 bg-carbon p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <b className="block truncate text-xs text-ivory">{update.title}</b>
                            <span className="text-[10px] uppercase text-brass">
                              {update.status} · {update.audience}
                            </span>
                          </div>
                          {update.status === 'scheduled' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await studioClient.chat.cancelAnnouncement(update.id);
                                setManagedUpdates(await studioClient.chat.announcements());
                              }}
                              className="text-[10px] text-red-300"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                        {update.status === 'published' && (
                          <p className="mt-1 text-[10px] text-ivory/40">
                            Delivered {update.deliveredCount || 0} · Read {update.readCount || 0}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
                {moderationReports.some((item) => item.status === 'open' || item.status === 'reviewing') && (
                  <div className="space-y-2 border-t border-red-400/15 pt-3">
                    <p className="text-[10px] uppercase tracking-widest text-red-300">Moderation reports</p>
                    {moderationReports
                      .filter((item) => item.status === 'open' || item.status === 'reviewing')
                      .slice(0, 5)
                      .map((item) => (
                        <article key={item.id} className="border border-red-400/15 p-2">
                          <b className="block text-xs text-ivory">{item.reason}</b>
                          <p className="mt-1 text-[10px] text-ivory/40">Reported by {item.reporter?.name || 'member'}</p>
                          <div className="mt-2 flex gap-2">
                            <button type="button" onClick={() => reviewReport(item.id, 'reviewing')} className="text-[10px] text-brass">
                              Reviewing
                            </button>
                            <button type="button" onClick={() => reviewReport(item.id, 'resolved')} className="text-[10px] text-green-300">
                              Resolve
                            </button>
                            <button type="button" onClick={() => reviewReport(item.id, 'dismissed')} className="text-[10px] text-ivory/40">
                              Dismiss
                            </button>
                          </div>
                        </article>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {error && !activeId && (
            <p role="alert" className="border-b border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">
              {error}
            </p>
          )}
          <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto pb-20 [scrollbar-gutter:stable] md:pb-5">
            {matchingConversations.map((conversation) => {
              const person = conversation.participants?.find((entry) => entry.id !== user.id);
              return (
                <button
                  key={conversation.id}
                  onClick={() => {
                    setActiveId(conversation.id);
                    setMobileConversationOpen(true);
                  }}
                  className={`flex w-full items-center gap-3 border-b border-brass/10 p-4 text-left ${activeId === conversation.id ? 'bg-brass/10' : 'hover:bg-ivory/[0.03]'}`}
                >
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brass/10 text-xs font-semibold text-brass">
                    <span className="flex h-full w-full overflow-hidden rounded-full">
                      {conversation.type === 'announcement' ? (
                        <span className="m-auto">
                          <Megaphone size={17} />
                        </span>
                      ) : person?.avatarUrl ? (
                        <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                          <span className="m-auto">{initials(conversation.type === 'group' ? conversation.title : person?.name)}</span>
                      )}
                    </span>
                    {person?.online && <i className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-carbon bg-green-400" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <b className="block truncate text-sm text-ivory">{conversationName(conversation, user.id)}</b>
                      {conversation.pinned && <Pin size={11} className="shrink-0 text-brass" aria-label="Pinned" />}
                      {conversation.favourite && <Star size={11} className="shrink-0 fill-brass text-brass" aria-label="Favourite" />}
                    </span>
                    <small className="flex min-w-0 items-center gap-1 text-ivory/35">
                      {!conversation.typingUsers?.length && conversation.lastMessageSenderId === user.id && (
                        conversation.lastMessageReadAt
                          ? <CheckCheck size={13} className="shrink-0 text-sky-400" aria-label="Read" />
                          : conversation.lastMessageDeliveredAt
                            ? <CheckCheck size={13} className="shrink-0 text-ivory/35" aria-label="Delivered" />
                            : <Check size={13} className="shrink-0 text-ivory/35" aria-label="Sent" />
                      )}
                      <span className="truncate">
                      {conversation.typingUsers?.length ? `${conversation.typingUsers[0].name} is typing…` : conversation.lastMessage || 'Conversation started'}
                      </span>
                    </small>
                  </span>
                  {conversation.unread > 0 && (
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-green-500 px-1 text-xs text-white">{conversation.unread}</span>
                  )}
                </button>
              );
            })}
            <div className="border-t border-brass/15 p-4">
              {adminMode && (
                <p className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-brass">
                  <Users size={13} />
                  Signed-in people
                </p>
              )}
              {matchingPeople.map((person) => (
                <button
                  key={person.id}
                  onClick={() => start(person)}
                  className="flex min-h-12 w-full items-center gap-3 border-b border-brass/10 text-left text-sm text-ivory/60 hover:text-ivory"
                >
                  <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ivory/5 text-[10px] text-brass">
                    <span className="flex h-full w-full overflow-hidden rounded-full">
                      {person.avatarUrl ? <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" /> : <span className="m-auto">{initials(person.name)}</span>}
                    </span>
                    {person.online && <i className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-carbon bg-green-400" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{person.name}</span>
                  <small className="text-brass/60">{person.role === 'customer' ? 'member' : person.role}</small>
                </button>
              ))}
              {!matchingPeople.length && !matchingConversations.length && <p className="py-6 text-center text-xs text-ivory/35">No people match your search.</p>}
            </div>
          </div>
        </aside>

        <section className={`${!mobileConversationOpen ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-col overflow-hidden`}>
          {active ? (
            <>
              <header className="shrink-0 flex items-center gap-1.5 border-b border-brass/15 px-2 py-1.5 sm:gap-3 sm:p-4">
                <button
                  onClick={() => setMobileConversationOpen(false)}
                  className="flex h-9 w-9 items-center justify-center text-brass lg:hidden"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft size={19} />
                </button>
                <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass/10 text-xs font-semibold text-brass sm:h-10 sm:w-10">
                  <span className="flex h-full w-full overflow-hidden rounded-full">
                    {active.type === 'announcement' ? (
                      <span className="m-auto">
                        <Megaphone size={17} />
                      </span>
                    ) : other?.avatarUrl ? (
                      <img src={other.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="m-auto">{initials(active.type === 'group' ? active.title : other?.name)}</span>
                    )}
                  </span>
                  {other?.online && <i className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-carbon bg-green-400" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg text-ivory sm:text-xl">{conversationName(active, user.id)}</p>
                  <p className={`truncate text-xs ${active.typingUsers?.length || other?.online ? 'text-green-400' : 'text-ivory/35'}`}>
                    {active.typingUsers?.length
                      ? `${active.typingUsers[0].name} is typing…`
                      : active.type === 'announcement'
                        ? 'Official updates — only administrators can post'
                        : lastSeen(other)}
                  </p>
                </div>
                {connectionState !== 'connected' && (
                  <span className="hidden items-center gap-1 text-[10px] uppercase tracking-wider text-amber-300 sm:flex">
                    <WifiOff size={13} />
                    {connectionState === 'offline' ? 'Offline' : 'Reconnecting'}
                  </span>
                )}
                {active.type !== 'announcement' && (
                  <span
                    className={`hidden items-center gap-1 text-[10px] uppercase tracking-wider md:flex ${encryptionState === 'ready' && recipientEncryptionState === 'ready' ? 'text-green-400' : 'text-amber-300'}`}
                    title={encryptionState === 'ready' && recipientEncryptionState === 'ready' ? 'Text messages are end-to-end encrypted on linked devices' : 'Messages use protected account delivery until every participant links an encrypted device'}
                  >
                    <Lock size={12} />
                    {encryptionState === 'ready' && recipientEncryptionState === 'ready' ? 'Encrypted' : 'Protected'}
                  </span>
                )}
                {active.type !== 'announcement' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowCallHistory(true)}
                      className="hidden h-10 w-10 items-center justify-center text-ivory/55 hover:text-brass sm:flex"
                      aria-label="Open call history"
                      title="Call history"
                    >
                      <Timer size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => beginCall('voice')}
                      className="hidden h-10 w-10 items-center justify-center text-ivory/55 hover:text-brass sm:flex"
                      aria-label="Start voice call"
                    >
                      <Phone size={17} />
                    </button>
                    <button
                      type="button"
                      onClick={() => beginCall('video')}
                      className="hidden h-10 w-10 items-center justify-center text-ivory/55 hover:text-brass sm:flex"
                      aria-label="Start video call"
                    >
                      <Video size={18} />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setSearchingMessages((value) => !value)}
                  className="flex h-10 w-10 items-center justify-center text-ivory/55 hover:text-brass"
                  aria-label="Search this conversation"
                >
                  <Search size={17} />
                </button>
                <div data-chat-popover className="relative">
                  <button
                    type="button"
                    onClick={(event) => {
                      const opening = !showConversationMenu;
                      closeFloatingMenus();
                      setShowConversationMenu(opening);
                      setConversationMenuPosition(opening ? floatingPosition(event.currentTarget, 240, menuHeight(440)) : null);
                    }}
                    className="flex h-10 w-10 items-center justify-center text-ivory/55 hover:text-brass"
                    aria-label="Conversation options"
                  >
                    <MoreVertical size={18} />
                  </button>
                  {showConversationMenu && conversationMenuPosition && createPortal(
                    <div data-chat-popover style={conversationMenuPosition} className="chat-conversation-menu chat-menu-scroll chat-menu-fade chat-menu-compact fixed z-[230] overflow-y-auto overscroll-contain rounded-xl border border-brass/20 bg-carbon px-1 shadow-2xl">
                      {active.type === 'group' && (
                        <button type="button" onClick={() => { setShowConversationMenu(false); openGroupSettings(); }} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/65 hover:bg-brass/10">
                          <Users size={14} /> Group info
                        </button>
                      )}
                      {active.type !== 'announcement' && (
                        <>
                          <button type="button" onClick={() => { setShowConversationMenu(false); beginCall('voice'); }} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/65 hover:bg-brass/10">
                            <Phone size={14} /> Voice call
                          </button>
                          <button type="button" onClick={() => { setShowConversationMenu(false); beginCall('video'); }} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/65 hover:bg-brass/10">
                            <Video size={14} /> Video call
                          </button>
                          <button type="button" onClick={() => { setShowConversationMenu(false); setShowCallHistory(true); }} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/65 hover:bg-brass/10">
                            <Timer size={14} /> Calls
                          </button>
                        </>
                      )}
                      <button type="button" onClick={() => openChatBrowser('media')} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/65 hover:bg-brass/10">
                        <Images size={14} /> Media & files
                      </button>
                      <button type="button" onClick={exportConversation} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/65 hover:bg-brass/10">
                        <Download size={14} /> Export chat
                      </button>
                      <button type="button" onClick={() => { setMessageSelectionMode(true); setSelectedMessageIds([]); setShowConversationMenu(false); }} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/65 hover:bg-brass/10">
                        <CheckCheck size={14} /> Select messages
                      </button>
                      <button type="button" onClick={() => setShowConversationMore(current => !current)} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs font-semibold text-brass hover:bg-brass/10">
                        <MoreVertical size={14} /> {showConversationMore ? 'Fewer options' : 'More'}
                      </button>
                      {showConversationMore && <>
                      <button type="button" onClick={() => clearConversationMessages(null)} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-red-300 hover:bg-red-400/10">
                        <Trash2 size={14} /> Clear chat
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = !chatAnimationsEnabled;
                          setChatAnimationsEnabled(next);
                          try { window.localStorage.setItem('atelier-chat-animations', next ? 'on' : 'off'); } catch { /* preference remains active for this visit */ }
                          setShowConversationMenu(false);
                        }}
                        className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/65 hover:bg-brass/10"
                      >
                        {chatAnimationsEnabled ? <Pause size={15} /> : <Play size={15} />}
                        {chatAnimationsEnabled ? 'Animations off' : 'Animations on'}
                      </button>
                      <Link to="/account#security" onClick={() => setShowConversationMenu(false)} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/65 hover:bg-brass/10">
                        <Lock size={14} /> Devices & data
                      </Link>
                      <button
                        type="button"
                        onClick={() => updateConversation({ muted: !active.muted })}
                        className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/65 hover:bg-brass/10"
                      >
                        {active.muted ? <Bell size={15} /> : <BellOff size={15} />}
                        {active.muted ? 'Unmute alerts' : 'Mute alerts'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConversation({ favourite: !active.favourite })}
                        className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/65 hover:bg-brass/10"
                      >
                        <Star size={15} className={active.favourite ? 'fill-brass text-brass' : ''} />
                        {active.favourite ? 'Remove favourite' : 'Add to favourites'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConversation({ pinned: !active.pinned })}
                        className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/65 hover:bg-brass/10"
                      >
                        <Pin size={15} />
                        {active.pinned ? 'Unpin chat' : 'Pin chat'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConversation({ markUnread: true })}
                        className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/65 hover:bg-brass/10"
                      >
                        <Mail size={15} />
                        Mark as unread
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConversation({ archived: !active.archived })}
                        className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/65 hover:bg-brass/10"
                      >
                        <Archive size={15} />
                        {active.archived ? 'Restore chat' : 'Archive chat'}
                      </button>
                      {active.type !== 'announcement' && (
                        <button
                          type="button"
                          onClick={() => updateConversation({ blocked: !active.blockedByMe })}
                          className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-red-300 hover:bg-red-400/10"
                        >
                          <Ban size={15} />
                          {active.blockedByMe ? 'Unblock person' : 'Block person'}
                        </button>
                      )}
                      {active.type !== 'announcement' && !adminMode && (
                        <button
                          type="button"
                          onClick={() => {
                            setReporting(true);
                            setShowConversationMenu(false);
                          }}
                          className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-red-300 hover:bg-red-400/10"
                        >
                          <Flag size={15} />
                          Report conversation
                        </button>
                      )}
                      </>}
                    </div>, document.body,
                  )}
                </div>
              </header>
              {searchingMessages && (
                <form onSubmit={runMessageSearch} className="grid gap-2 border-b border-brass/15 bg-carbon p-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_10rem_9rem_9rem_9rem_auto_auto]">
                  <label className="flex min-w-0 items-center gap-2 border border-brass/15 bg-obsidian px-3">
                    <Search size={14} className="text-brass" />
                    <input
                      autoFocus
                      value={messageQuery}
                      onChange={(event) => setMessageQuery(event.target.value)}
                      placeholder="Search messages and files"
                      className="h-10 min-w-0 flex-1 bg-transparent text-sm text-ivory outline-none"
                    />
                  </label>
                  <select value={messageSearchFilters.senderId} onChange={event => setMessageSearchFilters(value => ({ ...value, senderId: event.target.value }))} className="h-10 border border-brass/15 bg-obsidian px-2 text-xs text-ivory outline-none">
                    <option value="">Any sender</option>
                    {(active.participants || []).map(person => <option key={person.id} value={person.id}>{person.name || person.full_name || person.email}</option>)}
                  </select>
                  <select value={messageSearchFilters.attachmentType} onChange={event => setMessageSearchFilters(value => ({ ...value, attachmentType: event.target.value }))} className="h-10 border border-brass/15 bg-obsidian px-2 text-xs text-ivory outline-none">
                    <option value="">Any type</option><option value="media">Photo, video or audio</option><option value="document">Document</option><option value="link">Link</option>
                  </select>
                  <label className="grid h-10 w-full min-w-0 grid-cols-[4.25rem_minmax(0,1fr)] items-center border border-brass/15 bg-obsidian px-2 text-xs text-ivory/45">
                    <span>From date</span>
                    <input type="date" aria-label="From date" value={messageSearchFilters.from} onChange={event => setMessageSearchFilters(value => ({ ...value, from: event.target.value }))} className="h-9 w-full min-w-0 bg-transparent text-xs text-ivory outline-none [color-scheme:dark]" />
                  </label>
                  <label className="grid h-10 w-full min-w-0 grid-cols-[4.25rem_minmax(0,1fr)] items-center border border-brass/15 bg-obsidian px-2 text-xs text-ivory/45">
                    <span>To date</span>
                    <input type="date" aria-label="To date" value={messageSearchFilters.to} onChange={event => setMessageSearchFilters(value => ({ ...value, to: event.target.value }))} className="h-9 w-full min-w-0 bg-transparent text-xs text-ivory outline-none [color-scheme:dark]" />
                  </label>
                  <button disabled={searchBusy} className="h-10 border border-brass/20 px-3 text-xs text-brass disabled:opacity-40">
                    {searchBusy ? 'Searching…' : 'Search'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMessageQuery('');
                      setMessageSearchFilters({ senderId: '', attachmentType: '', from: '', to: '' });
                      setSearchingMessages(false);
                      loadMessages(activeId, '', { scrollToBottom: true });
                    }}
                    className="h-10 w-10 border border-brass/20 text-ivory/50"
                  >
                    <X size={15} className="mx-auto" />
                  </button>
                </form>
              )}
              {error && (
                <p role="alert" className="border-b border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">
                  {error}
                </p>
              )}
              {messageSelectionMode && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brass/15 bg-brass/5 px-3 py-2">
                  <span className="text-xs text-ivory/60">{selectedMessageIds.length ? `${selectedMessageIds.length} selected` : 'Tap messages to select them'}</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setSelectedMessageIds(messages.map(message => message.id))} className="min-h-9 border border-brass/20 px-3 text-xs text-brass">Select all</button>
                    <button type="button" disabled={!selectedMessageIds.length || busy} onClick={() => clearConversationMessages(selectedMessageIds)} className="min-h-9 border border-red-300/20 px-3 text-xs text-red-200 disabled:opacity-40">Delete selected</button>
                    <button type="button" onClick={() => { setMessageSelectionMode(false); setSelectedMessageIds([]); }} className="flex h-9 w-9 items-center justify-center border border-brass/20 text-ivory/50" aria-label="Cancel message selection"><X size={15} /></button>
                  </div>
                </div>
              )}
              {securityNotice && (
                <div className="flex items-center justify-between gap-3 border-b border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-100">
                  <span>{securityNotice}</span><button type="button" onClick={() => setSecurityNotice('')} className="shrink-0 text-amber-200"><X size={14} /></button>
                </div>
              )}
              {active.blocked && (
                <p className="border-b border-amber-400/20 bg-amber-400/5 p-3 text-center text-xs text-amber-200">
                  {active.blockedByMe ? 'You blocked this conversation. Use the menu to unblock it.' : 'This person is not accepting messages from this conversation.'}
                </p>
              )}
              {reporting && (
                <form onSubmit={submitReport} className="grid gap-2 border-b border-red-400/20 bg-red-400/5 p-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]">
                  <select
                    required
                    value={report.reason}
                    onChange={(event) =>
                      setReport((value) => ({
                        ...value,
                        reason: event.target.value,
                      }))
                    }
                    className="h-10 border border-red-300/20 bg-obsidian px-3 text-sm text-ivory"
                  >
                    <option value="">Choose a reason</option>
                    <option>Spam or scam</option>
                    <option>Harassment</option>
                    <option>Unsafe content</option>
                    <option>Impersonation</option>
                    <option>Other concern</option>
                  </select>
                  <input
                    value={report.details}
                    onChange={(event) =>
                      setReport((value) => ({
                        ...value,
                        details: event.target.value,
                      }))
                    }
                    placeholder="Optional details for the moderator"
                    className="h-10 min-w-0 border border-red-300/20 bg-obsidian px-3 text-sm text-ivory"
                  />
                  <div className="flex gap-2">
                    <button disabled={busy} className="h-10 bg-red-300 px-3 text-xs text-obsidian">
                      Send report
                    </button>
                    <button type="button" onClick={() => setReporting(false)} className="h-10 border border-red-300/20 px-3 text-xs text-red-200">
                      Cancel
                    </button>
                  </div>
                </form>
              )}
              <div
                ref={messagesPaneRef}
                onScroll={handleMessageScroll}
                tabIndex={0}
                role="log"
                aria-label={`Messages with ${conversationName(active, user.id)}`}
                aria-live="polite"
                className="atelier-chat-canvas relative min-h-0 min-w-0 flex-1 overscroll-contain overflow-x-hidden overflow-y-auto p-3 [scrollbar-gutter:stable] sm:p-6"
              >
                {messagesLoading && (
                  <div className="space-y-3 py-3" role="status" aria-label="Loading messages">
                    {[0, 1, 2, 3, 4].map((row) => (
                      <div key={row} className={`flex ${row % 2 ? 'justify-end' : 'justify-start'}`}>
                        <div className={`h-14 animate-pulse rounded-2xl bg-ivory/[0.045] ${row % 3 === 0 ? 'w-[38%]' : 'w-[56%]'}`} />
                      </div>
                    ))}
                  </div>
                )}
                {nextCursor && !messageQuery && (
                  <button
                    type="button"
                    disabled={loadingOlder}
                    onClick={loadOlderMessages}
                    className="mx-auto flex h-9 items-center gap-2 border border-brass/15 px-4 text-xs text-brass disabled:opacity-40"
                  >
                    {loadingOlder && <Loader2 size={13} className="animate-spin" />}
                    Load older messages
                  </button>
                )}
                {!messagesLoading && messages.map((message, index) => {
                  const mine = message.senderId === user.id;
                  const attachment = message.attachmentUrl
                    ? {
                        url: message.pendingLocalAttachment ? message.attachmentUrl : studioClient.chat.attachmentUrl(message.id),
                        previewUrl: message.pendingLocalAttachment ? message.attachmentUrl : studioClient.chat.attachmentUrl(message.id),
                        downloadUrl: message.pendingLocalAttachment ? message.attachmentUrl : studioClient.chat.attachmentUrl(message.id, true),
                        name: message.decryptedAttachment?.name || message.attachmentName,
                        type: message.decryptedAttachment?.type || message.attachmentType,
                        bytes: message.decryptedAttachment?.bytes || message.attachmentBytes,
                        encryptedMetadata: message.decryptedAttachment || null,
                        messageId: message.id,
                        duration: message.voiceDurationSeconds,
                      }
                    : null;
                  const voiceAttachment = isVoiceAttachment(attachment || {});
                  const emojiOnly = !attachment && !message.sticker && !message.richMedia && isEmojiOnlyMessage(message.body);
                  const groupedReactions = Object.values(message.reactions || {}).reduce(
                    (result, emoji) => ({
                      ...result,
                      [emoji]: (result[emoji] || 0) + 1,
                    }),
                    {},
                  );
                  const previous = messages[index - 1];
                  const next = messages[index + 1];
                  const showDate = !previous || new Date(previous.created_date).toDateString() !== new Date(message.created_date).toDateString();
                  const groupedWithPrevious = !showDate
                    && previous?.senderId === message.senderId
                    && Math.abs(new Date(message.created_date).getTime() - new Date(previous.created_date).getTime()) < 5 * 60 * 1000;
                  const groupedWithNext = next
                    && next.senderId === message.senderId
                    && new Date(next.created_date).toDateString() === new Date(message.created_date).toDateString()
                    && Math.abs(new Date(next.created_date).getTime() - new Date(message.created_date).getTime()) < 5 * 60 * 1000;
                  const replyTarget = message.replyToId ? messages.find(item => item.id === message.replyToId) : null;
                  const replySenderName = replyTarget?.senderId === user.id
                    ? 'You'
                    : active?.participants?.find(person => person.id === replyTarget?.senderId)?.name || 'Original message';
                  return (
                    <div
                      key={message.id}
                      data-chat-message-id={message.id}
                      className={`min-w-0 max-w-full rounded-xl transition-[background-color,box-shadow] duration-500 ${groupedWithPrevious ? 'mt-1' : 'mt-3'} ${chatAnimationsEnabled ? 'chat-message-enter' : ''} ${highlightedMessageId === message.id ? 'bg-brass/10 shadow-[0_0_0_1px_rgba(200,164,91,0.35)]' : ''}`}
                    >
                      {showDate && (
                        <div className="my-4 flex items-center gap-3" aria-label={`Messages from ${new Date(message.created_date).toLocaleDateString()}`}>
                          <span className="h-px flex-1 bg-brass/10" />
                          <span className="text-[10px] uppercase tracking-widest text-ivory/35">
                            {new Date(message.created_date).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                          <span className="h-px flex-1 bg-brass/10" />
                        </div>
                      )}
                      <div className={`group flex min-w-0 max-w-full items-center gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                        {messageSelectionMode && (
                          <button
                            type="button"
                            onClick={() => setSelectedMessageIds(current => current.includes(message.id) ? current.filter(id => id !== message.id) : [...current, message.id])}
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${selectedMessageIds.includes(message.id) ? 'border-brass bg-brass text-obsidian' : 'border-brass/30 text-transparent hover:border-brass/60'}`}
                            aria-label={`${selectedMessageIds.includes(message.id) ? 'Deselect' : 'Select'} message`}
                            aria-pressed={selectedMessageIds.includes(message.id)}
                          >
                            <Check size={15} />
                          </button>
                        )}
                        <article
                          onClick={messageSelectionMode ? () => setSelectedMessageIds(current => current.includes(message.id) ? current.filter(id => id !== message.id) : [...current, message.id]) : undefined}
                          className={`chat-bubble relative min-w-0 ${messageSelectionMode ? 'cursor-pointer' : ''} ${emojiOnly ? 'chat-bubble-emoji w-fit max-w-[86%] border-0 bg-transparent px-1 py-0' : `rounded-xl border ${voiceAttachment ? 'w-fit max-w-[92%] px-1 py-1 sm:max-w-[20rem]' : 'w-fit max-w-[86%] px-2.5 py-1.5 sm:max-w-[28rem]'} ${mine ? 'chat-bubble-mine border-brass/20 bg-brass/10' : 'chat-bubble-incoming border-ivory/10 bg-carbon'} ${!groupedWithNext ? 'chat-bubble-tail' : ''}`}`}
                        >
                          {message.replyToId && (
                            <QuotedMessage
                              message={message}
                              target={replyTarget}
                              senderName={replySenderName}
                              onActivate={() => jumpToRepliedMessage(message.replyToId)}
                            />
                          )}
                          {message.pending && (
                            <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-brass/70" role="status">
                              <span className={chatAnimationsEnabled ? 'chat-sending-dot' : ''} />
                              {message.pendingUploadItemId ? `Sending ${uploadProgress[message.pendingUploadItemId] || 1}%` : 'Sending'}
                            </div>
                          )}
                          {message.deletedForEveryone ? (
                            <div className="flex items-center gap-3">
                              <p className="flex items-center gap-2 text-sm italic text-ivory/35">
                                <Ban size={14} />
                                This message was deleted.
                              </p>
                              <button type="button" onClick={() => removeMessage(message, 'me')} className="text-[10px] uppercase tracking-wider text-ivory/30 hover:text-brass">
                                Remove
                              </button>
                            </div>
                          ) : editing?.id === message.id ? (
                            <div className="space-y-2">
                              <textarea
                                autoFocus
                                value={editing.body}
                                onChange={(event) =>
                                  setEditing({
                                    ...editing,
                                    body: event.target.value,
                                  })
                                }
                                className="min-h-20 w-full resize-none border border-brass/20 bg-obsidian p-2 text-sm text-ivory outline-none"
                              />
                              <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setEditing(null)} className="h-8 px-3 text-xs text-ivory/50">
                                  Cancel
                                </button>
                                <button type="button" onClick={saveEdit} className="h-8 bg-brass px-3 text-xs text-obsidian">
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            message.body && <p className={emojiOnly ? 'chat-emoji-only whitespace-pre-wrap text-[3.35rem] leading-none' : 'whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-5 text-ivory/80'}>{message.body}</p>
                          )}
                          {message.sticker && <div className="chat-sticker-pop py-2 text-center text-7xl" role="img" aria-label="Sticker">{message.sticker}</div>}
                          {message.encryptionError && (
                            <p className="flex items-center gap-2 text-xs italic text-amber-300/80" title={message.encryptionError}>
                              <Lock size={13} /> This encrypted message is unavailable on this device.
                            </p>
                          )}
                          {!message.deletedForEveryone && message.body && <SecureLinkPreview body={message.body} />}
                          {message.richMedia && (
                            <a
                              href={message.richMedia.url || '#'}
                              target={message.richMedia.url ? '_blank' : undefined}
                              rel="noreferrer"
                              className="mt-3 block overflow-hidden border border-brass/15 bg-obsidian"
                            >
                              {message.richMedia.imageUrl && <img src={message.richMedia.imageUrl} alt="" className="max-h-56 w-full object-cover" />}
                              <span className="block p-3">
                                <b className="text-sm text-ivory">{message.richMedia.title || (message.richMedia.type === 'film' ? 'Art Film' : 'Featured studio item')}</b>
                                <small className="mt-1 block uppercase tracking-wider text-brass">View {message.richMedia.type}</small>
                              </span>
                            </a>
                          )}
                          {message.action?.url && (
                            <a
                              href={message.action.url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 flex min-h-10 items-center justify-center bg-brass px-4 text-xs uppercase tracking-wider text-obsidian"
                            >
                              {message.action.label || 'Learn more'}
                            </a>
                          )}
                          {message.sharedLocation && <LocationPreview location={message.sharedLocation} mine={mine} onStop={() => stopLiveLocation(message)} />}
                          {message.sharedContact && (
                            <div className="mt-3 overflow-hidden rounded-xl border border-brass/15 bg-obsidian text-sm">
                              <div className="flex items-center gap-3 p-3">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brass/10 text-brass"><Contact size={20} /></span>
                                <span className="min-w-0 flex-1">
                                  <b className="block truncate text-ivory">{message.sharedContact.name}</b>
                                  {message.sharedContact.phone && <small className="block truncate text-ivory/45">{message.sharedContact.phone}</small>}
                                  {message.sharedContact.email && <small className="block truncate text-ivory/45">{message.sharedContact.email}</small>}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 border-t border-brass/10 text-xs font-medium text-brass">
                                <a href={message.sharedContact.phone ? `tel:${String(message.sharedContact.phone).replace(/[^+\d]/g, '')}` : `mailto:${message.sharedContact.email}`} className="flex min-h-10 items-center justify-center border-r border-brass/10 hover:bg-brass/10">
                                  {message.sharedContact.phone ? 'Call' : 'Email'}
                                </a>
                                <a href={studioClient.chat.contactCardUrl(message.id)} download className="flex min-h-10 items-center justify-center hover:bg-brass/10">Save contact</a>
                              </div>
                            </div>
                          )}
                          {message.sharedPoll && (() => {
                            const votes = Object.values(message.sharedPoll.votesByUser || {});
                            const myVote = message.sharedPoll.votesByUser?.[user.id];
                            return (
                              <div className="mt-3 min-w-[14rem] overflow-hidden rounded-xl border border-brass/15 bg-obsidian p-3">
                                <div className="mb-3 flex items-start gap-2"><BarChart3 size={18} className="mt-0.5 shrink-0 text-brass" /><b className="text-sm text-ivory">{message.sharedPoll.question}</b></div>
                                <div className="space-y-1.5">
                                  {message.sharedPoll.options.map((option, optionIndex) => {
                                    const count = votes.filter(vote => vote === optionIndex).length;
                                    return <button key={`${message.id}-${optionIndex}`} type="button" onClick={() => voteInPoll(message.id, optionIndex)} className={`flex min-h-9 w-full items-center justify-between rounded-lg border px-3 text-left text-xs ${myVote === optionIndex ? 'border-brass bg-brass/10 text-brass' : 'border-brass/10 text-ivory/70 hover:bg-white/5'}`}><span>{option}</span><span>{count}</span></button>;
                                  })}
                                </div>
                                <small className="mt-2 block text-ivory/40">{votes.length} vote{votes.length === 1 ? '' : 's'}</small>
                              </div>
                            );
                          })()}
                          {message.sharedEvent && (
                            <div className="mt-3 overflow-hidden rounded-xl border border-brass/15 bg-obsidian p-3 text-sm">
                              <div className="flex items-start gap-3"><CalendarDays size={20} className="mt-0.5 shrink-0 text-rose-400" /><span><b className="block text-ivory">{message.sharedEvent.title}</b><small className="mt-1 block text-ivory/55">{new Date(message.sharedEvent.startsAt).toLocaleString()}</small>{message.sharedEvent.location && <small className="mt-1 block text-ivory/45">{message.sharedEvent.location}</small>}</span></div>
                              {message.sharedEvent.notes && <p className="mt-3 text-xs leading-5 text-ivory/60">{message.sharedEvent.notes}</p>}
                            </div>
                          )}
                          {attachment && message.viewOnce && !mine && message.viewedOnceBy?.includes(user.id) ? (
                            <div className="mt-3 flex items-center gap-2 border border-brass/15 p-3 text-xs text-ivory/40">
                              <Eye size={15} />
                              View-once attachment opened
                            </div>
                          ) : attachment && message.viewOnce && !mine ? (
                            <button
                              type="button"
                              onClick={async () => {
                                await studioClient.chat.consume(message.id);
                                setPreview(attachment);
                                await loadMessages(activeId);
                              }}
                              className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 border border-brass/20 text-sm text-brass"
                            >
                              <Eye size={17} />
                              Open view-once attachment
                            </button>
                          ) : (
                            <AttachmentPreview attachment={attachment} onOpen={setPreview} />
                          )}
                          {voiceAttachment && !attachment?.encryptedMetadata && (
                            <button
                              type="button"
                              disabled={transcribingId === message.id}
                              onClick={() => transcribeMessage(message)}
                              className="mt-2 text-[10px] uppercase tracking-wider text-brass disabled:opacity-40"
                            >
                              {transcribingId === message.id ? 'Requesting transcription…' : 'Transcribe voice note'}
                            </button>
                          )}
                          {message.transcription?.text && <p className="mt-2 border-l-2 border-brass/30 px-3 text-xs leading-5 text-ivory/55">{message.transcription.text}</p>}
                          {message.expiresAt && (
                            <p className="mt-2 flex items-center gap-1 text-[10px] text-ivory/30">
                              <Timer size={11} />
                              Disappears {new Date(message.expiresAt).toLocaleString()}
                            </p>
                          )}
                          {message.starredBy?.includes(user.id) && <Star size={12} className="absolute right-2 top-2 fill-brass text-brass" aria-label="Starred message" />}
                          {message.pinned && <Pin size={12} className="absolute right-7 top-2 fill-brass text-brass" aria-label="Pinned message" />}
                          <div className="mt-1.5 flex flex-wrap items-end gap-2">
                            {!message.deletedForEveryone && (
                              <div data-chat-popover className="relative flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setReplyingTo(message)}
                                  title="Reply"
                                  className="flex h-7 w-7 items-center justify-center text-ivory/30 hover:text-brass"
                                >
                                  <Reply size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    const opening = reactionPickerId !== message.id;
                                    closeFloatingMenus();
                                    setReactionPickerId(opening ? message.id : '');
                                    setReactionPickerPosition(opening ? floatingPosition(event.currentTarget, Math.min(304, window.innerWidth - 16), 60) : null);
                                  }}
                                  title="React"
                                  className="flex h-7 w-7 items-center justify-center text-ivory/30 hover:text-brass"
                                >
                                  <Smile size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    const opening = messageMenuId !== message.id;
                                    closeFloatingMenus();
                                    setMessageMenuId(opening ? message.id : '');
                                    setMessageMenuPosition(opening ? floatingPosition(event.currentTarget, 220, 190) : null);
                                  }}
                                  title="Message options"
                                  className="flex h-7 w-7 items-center justify-center text-ivory/30 hover:text-brass"
                                >
                                  <MoreVertical size={13} />
                                </button>
                              </div>
                            )}
                            <div className="ml-auto flex shrink-0 items-center gap-1 self-end text-[10px] leading-none text-ivory/35">
                              {message.editedAt && <span>edited · </span>}
                              {new Date(message.created_date).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                              {mine && (message.readAt
                                ? <CheckCheck size={13} aria-label="Read" className="text-sky-400" />
                                : message.deliveredAt
                                  ? <CheckCheck size={13} aria-label="Delivered" className="text-ivory/35" />
                                  : <Check size={13} aria-label="Sent" className="text-ivory/35" />)}
                            </div>
                          </div>
                          {Object.keys(groupedReactions).length > 0 && (
                            <div className="absolute -bottom-3 right-2 rounded-full border border-brass/15 bg-carbon px-2 py-0.5 text-xs shadow-lg">
                              {Object.entries(groupedReactions).map(([emoji, count]) => (
                                <span key={`${emoji}-${count}`} className="chat-reaction-pop mr-1 inline-block">
                                  {emoji}
                                  {count > 1 ? count : ''}
                                </span>
                              ))}
                            </div>
                          )}
                          {adminMode && attachment && (
                            <button type="button" onClick={() => setForwarding(message)} className="mt-3 block text-[10px] uppercase tracking-wider text-brass/70 hover:text-brass">
                              {message.allowForward ? 'Forwarding allowed' : 'Allow customer forwarding'}
                            </button>
                          )}
                        </article>
                      </div>
                    </div>
                  );
                })}
                {!messagesLoading && !messages.length && (
                  <div className="py-16 text-center">
                    <MessageCircle className="mx-auto text-brass/40" />
                    <p className="mt-3 text-sm text-ivory/35">Start the conversation. Messages and files stay with this account.</p>
                  </div>
                )}
                {showJumpToLatest && (
                  <button
                    type="button"
                    onClick={jumpToLatest}
                    className="sticky bottom-2 ml-auto flex h-10 items-center gap-2 rounded-full border border-brass/30 bg-carbon px-4 text-xs text-brass shadow-xl"
                  >
                    <ArrowDown size={14} />
                    Latest
                  </button>
                )}
              </div>
              <footer className={`chat-composer-footer relative z-30 shrink-0 bg-transparent p-2 sm:p-3 ${emojiMenuPosition ? 'chat-composer-footer--emoji-open' : ''}`}>
                {replyingTo && (
                  <div className="relative mb-2 pr-9">
                    <QuotedMessage
                      message={{}}
                      target={replyingTo}
                      senderName={replyingTo.senderId === user.id ? 'You' : active?.participants?.find(person => person.id === replyingTo.senderId)?.name || 'Reply'}
                    />
                    <button
                      type="button"
                      onClick={() => setReplyingTo(null)}
                      aria-label="Cancel reply"
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-ivory/50 hover:bg-white/5 hover:text-ivory"
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
                {attachments.length > 0 && (
                  <div className="mb-2 min-w-0 max-w-full overflow-hidden rounded-2xl border border-brass/15 bg-obsidian p-2">
                    <div className="flex max-h-52 max-w-full gap-2 overflow-x-auto overscroll-contain pb-1 [scrollbar-gutter:stable]">
                      {attachments.map((item) => (
                        <div key={item.id} className="relative w-40 shrink-0 border border-brass/10 bg-carbon p-2">
                          <AttachmentPreview
                            compact
                            attachment={{
                              url: item.previewUrl,
                              name: item.file.name,
                              type: item.mime,
                              bytes: item.file.size,
                            }}
                            onOpen={setPreview}
                          />
                          {String(item.mime || '').startsWith('image/') && (
                            <button type="button" disabled={busy} onClick={() => toggleAttachmentCrop(item.id)} className={`mt-2 w-full rounded-lg border px-2 py-1.5 text-[10px] font-semibold ${item.cropped ? 'border-brass bg-brass/10 text-brass' : 'border-brass/15 text-ivory/55'}`}>
                              {item.cropped ? 'Square crop applied' : 'Crop square'}
                            </button>
                          )}
                          <input
                            value={item.caption || ''}
                            disabled={busy}
                            maxLength={1000}
                            onChange={event => setAttachments(current => current.map(attachment => attachment.id === item.id ? { ...attachment, caption: event.target.value } : attachment))}
                            placeholder="Add a caption…"
                            className="mt-2 min-h-9 w-full rounded-lg border border-brass/15 bg-obsidian px-2 text-xs text-ivory outline-none placeholder:text-ivory/35 focus:border-brass"
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => removeAttachment(item.id)}
                            aria-label={`Remove ${item.file.name}`}
                            className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/80 text-white disabled:opacity-40"
                          >
                            <X size={14} />
                          </button>
                          {busy && (
                            <div className="mt-2">
                              <div className="flex justify-between text-[10px] text-ivory/45">
                                <span>Uploading</span>
                                <span>{uploadProgress[item.id] || 0}%</span>
                              </div>
                              <div className="mt-1 h-1 overflow-hidden bg-ivory/10">
                                <div
                                  className="h-full bg-brass transition-all"
                                  style={{
                                    width: `${uploadProgress[item.id] || 0}%`,
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <span
                        className={`text-[10px] uppercase tracking-wider text-ivory/35 ${attachments.length === 1 && /^voice-message-/i.test(attachments[0]?.file?.name || '') ? 'hidden' : ''}`}
                      >
                        {attachments.length} of 10 files selected
                      </span>
                      <div className="flex items-center gap-3">
                        {attachments.length < 10 && !busy && (
                          <label className="flex min-h-9 cursor-pointer items-center gap-1.5 border border-brass/20 px-3 text-[10px] uppercase tracking-wider text-brass">
                            <Plus size={13} />
                            Add more
                            <input
                              type="file"
                              multiple
                              className="hidden"
                              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                              onChange={(event) => {
                                chooseFiles(event.target.files);
                                event.target.value = '';
                              }}
                            />
                          </label>
                        )}
                        {busy && (
                          <button type="button" onClick={() => uploadAbortRef.current?.abort()} className="text-[10px] uppercase tracking-wider text-red-300">
                            Cancel upload
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {uploadFailed && attachments.length > 0 && !busy && (
                  <button type="button" onClick={send} className="mb-2 flex h-10 w-full items-center justify-center gap-2 border border-red-400/25 text-xs text-red-300">
                    <RotateCcw size={14} />
                    Retry failed upload
                  </button>
                )}
                <div className={`flex min-w-0 items-end gap-0.5 ${recording ? 'bg-transparent p-0 shadow-none' : 'rounded-[1.55rem] border border-brass/20 bg-obsidian p-1 shadow-inner'}`}>
                  <div data-chat-popover className={`relative ${recording ? 'md:hidden' : ''}`}>
                    <button
                      type="button"
                      disabled={active.blocked || (active.type === 'announcement' && !adminMode)}
                      onClick={(event) => {
                        const opening = !showAttachmentMenu;
                        closeFloatingMenus();
                        setShowAttachmentMenu(opening);
                        setAttachmentMenuPosition(opening ? floatingPosition(event.currentTarget, 260, menuHeight(420)) : null);
                      }}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ivory/55 transition hover:bg-white/5 hover:text-brass disabled:cursor-not-allowed disabled:opacity-40"
                      title="Add an attachment"
                      aria-label="Open attachment menu"
                    >
                      <Paperclip size={17} />
                    </button>
                    {showAttachmentMenu && attachmentMenuPosition && createPortal(
                      <div data-chat-popover style={attachmentMenuPosition} className="chat-attachment-menu chat-mobile-sheet chat-menu-scroll chat-menu-fade chat-menu-compact fixed z-[230] overflow-y-auto overscroll-contain rounded-xl border border-brass/20 bg-carbon px-1 shadow-2xl">
                        <div className="chat-sheet-heading" aria-hidden="true"><span />Share</div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAttachmentMenu(false);
                            photosInputRef.current?.click();
                          }}
                          className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/70 hover:bg-brass/10"
                        >
                          <Image size={15} className="text-sky-400" />
                          <span>Photos & video</span>
                        </button>
                        <button type="button" onClick={() => { setShowAttachmentMenu(false); setAttachmentMenuPosition(null); setShowCameraCapture(true); }} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/70 hover:bg-brass/10 lg:hidden">
                          <Camera size={15} className="text-pink-400" /><span>Camera</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAttachmentMenu(false);
                            documentsInputRef.current?.click();
                          }}
                          className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/70 hover:bg-brass/10"
                        >
                          <FileText size={15} className="text-purple-400" />
                          <span>Documents</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAttachmentMenu(false);
                            audioInputRef.current?.click();
                          }}
                          className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/70 hover:bg-brass/10"
                        >
                          <Mic size={15} className="text-orange-400" />
                          <span>Audio</span>
                        </button>
                        <button type="button" onClick={openGifPicker} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/70 hover:bg-brass/10">
                          <span className="flex h-[18px] min-w-[27px] items-center justify-center rounded-sm bg-gradient-to-r from-fuchsia-500 via-cyan-400 to-emerald-400 px-1 text-[8px] font-bold tracking-wide text-black">
                            GIF
                          </span>
                          <span>GIFs</span>
                        </button>
                        <button type="button" onClick={() => { setShowAttachmentMenu(false); setShowStickerPicker(true); }} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/70 hover:bg-brass/10">
                          <span className="text-base">✨</span>
                          <span>Stickers</span>
                        </button>
                        <button type="button" onClick={() => shareLocation(false)} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/70 hover:bg-brass/10">
                          <MapPin size={15} className="text-green-400" />
                          <span>Location</span>
                        </button>
                        <button type="button" onClick={() => shareLocation(true)} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/70 hover:bg-brass/10">
                          <MapPin size={15} className="animate-pulse text-emerald-300" />
                          <span>Live location</span>
                        </button>
                        <button type="button" onClick={shareContact} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/70 hover:bg-brass/10">
                          <Contact size={15} className="text-cyan-400" />
                          <span>Contact</span>
                        </button>
                        <button type="button" onClick={() => { setShowAttachmentMenu(false); setStructuredComposer({ kind: 'poll', question: '', options: ['', ''] }); }} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/70 hover:bg-brass/10">
                          <BarChart3 size={15} className="text-amber-400" /><span>Poll</span>
                        </button>
                        <button type="button" onClick={() => { setShowAttachmentMenu(false); setStructuredComposer({ kind: 'event', title: '', startsAt: '', endsAt: '', location: '', notes: '' }); }} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/70 hover:bg-brass/10">
                          <CalendarDays size={15} className="text-rose-400" /><span>Event</span>
                        </button>
                        <button type="button" onClick={openShopPicker} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/70 hover:bg-brass/10">
                          <ShoppingBag size={15} className="text-brass" />
                          <span>Art Shop</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openResourcePicker('gallery')}
                          className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/70 hover:bg-brass/10"
                        >
                          <Images size={15} className="text-emerald-400" />
                          <span>Gallery</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openResourcePicker('films')}
                          className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-ivory/70 hover:bg-brass/10"
                        >
                          <Clapperboard size={15} className="text-violet-400" />
                          <span>Art Films</span>
                        </button>
                      </div>, document.body,
                    )}
                    <input
                      ref={photosInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      accept="image/*,video/*,.heic,.heif"
                      onChange={(event) => {
                        chooseFiles(event.target.files);
                        event.target.value = '';
                      }}
                    />
                    <input
                      ref={documentsInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                      onChange={(event) => {
                        chooseFiles(event.target.files);
                        event.target.value = '';
                      }}
                    />
                    <input
                      ref={audioInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      accept="audio/*"
                      onChange={(event) => {
                        chooseFiles(event.target.files);
                        event.target.value = '';
                      }}
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      className="hidden"
                      accept="image/*"
                      capture="environment"
                      onChange={(event) => {
                        chooseFiles(event.target.files, { camera: true });
                        event.target.value = '';
                      }}
                    />
                  </div>
                  {!recording && (
                    <button
                      type="button"
                      disabled={active.blocked || (active.type === 'announcement' && !adminMode)}
                      onClick={(event) => {
                        const opening = !emojiMenuPosition;
                        closeFloatingMenus();
                        setMobileEmojiTab('emoji');
                        setEmojiMenuPosition(opening ? floatingPosition(event.currentTarget, 360, menuHeight(430)) : null);
                      }}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ivory/55 transition hover:bg-white/5 hover:text-brass disabled:opacity-40"
                      aria-label="Choose an emoji"
                      title="Emoji"
                      data-chat-popover
                    >
                      <Smile size={18} />
                    </button>
                  )}
                  {recording ? (
                    <VoiceNoteRecorder
                      onCancel={cancelRecording}
                      onReady={attachRecordedVoice}
                      onSend={sendRecordedVoice}
                      viewOnce={viewOnce}
                      onViewOnceChange={setViewOnce}
                    />
                  ) : (
                    <textarea
                      ref={composerRef}
                      value={text}
                      disabled={active.blocked || (active.type === 'announcement' && !adminMode)}
                      onChange={(event) => updateTyping(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          send();
                        }
                      }}
                      rows={1}
                      placeholder={active.type === 'announcement' && !adminMode ? 'Community Updates is read-only for members' : 'Write a message…'}
                      className="max-h-24 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm leading-5 text-ivory outline-none placeholder:text-ivory/35 disabled:opacity-50"
                    />
                  )}
                  {!recording && (
                    <button
                      type="button"
                      onClick={(event) => {
                        const opening = !composerOptionsPosition;
                        closeFloatingMenus();
                        setComposerOptionsPosition(opening ? floatingPosition(event.currentTarget, 250, 168) : null);
                      }}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-white/5 ${viewOnce || disappearAfter ? 'text-brass' : 'text-ivory/45'}`}
                      aria-label="Open message options"
                      title="Message options"
                      data-chat-popover
                    >
                      <Timer size={17} />
                    </button>
                  )}
                  {!recording && (text.trim() || attachments.length) ? (
                    <button
                      disabled={busy || active.blocked || (active.type === 'announcement' && !adminMode)}
                      onClick={send}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass text-obsidian transition-transform active:scale-95 disabled:opacity-40"
                      aria-label="Send message"
                    >
                      {busy ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
                    </button>
                  ) : !recording ? (
                    <button
                      type="button"
                      disabled={busy || active.blocked || (active.type === 'announcement' && !adminMode)}
                      onClick={toggleRecording}
                      title="Record voice message"
                      aria-label="Record voice message"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass text-obsidian transition-transform active:scale-95 disabled:opacity-40"
                    >
                      <Mic size={18} />
                    </button>
                  ) : null}
                </div>
                {emojiMenuPosition && createPortal(
                  <div
                    data-chat-popover
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                    style={window.innerWidth >= 1024 ? emojiMenuPosition : undefined}
                    className="chat-emoji-picker fixed inset-x-0 bottom-0 z-[240] h-[min(46dvh,23rem)] overflow-hidden rounded-t-2xl border border-brass/20 bg-carbon shadow-2xl lg:inset-auto lg:h-[27rem] lg:rounded-2xl"
                  >
                    <div className="grid h-11 grid-cols-3 border-b border-white/10 px-3" aria-label="Emoji, GIF and sticker choices">
                      {['emoji', 'gif', 'stickers'].map(tab => (
                        <button key={tab} type="button" onClick={() => { setMobileEmojiTab(tab); if (tab === 'gif' && !gifResults.length) searchGifs(gifQuery); }} className={`border-b-2 text-xs font-semibold capitalize ${mobileEmojiTab === tab ? 'border-brass text-brass' : 'border-transparent text-ivory/50'}`}>{tab === 'stickers' ? 'Stickers' : tab.toUpperCase()}</button>
                      ))}
                    </div>
                    <div className={mobileEmojiTab === 'emoji' ? 'h-[calc(100%_-_2.75rem)]' : 'hidden'}>
                    <EmojiPicker
                      theme={Theme.DARK}
                      emojiStyle={window.innerWidth >= 1024 ? EmojiStyle.APPLE : EmojiStyle.NATIVE}
                      width="100%"
                      height="100%"
                      lazyLoadEmojis
                      previewConfig={{ showPreview: false }}
                      skinTonesDisabled={false}
                      searchPlaceHolder="Search emoji"
                      onEmojiClick={({ emoji }) => {
                        if (emojiReactionTarget) {
                          const message = messages.find(item => item.id === emojiReactionTarget);
                          if (message) react(message, emoji);
                          setEmojiReactionTarget('');
                          setEmojiMenuPosition(null);
                        } else {
                          updateTyping(`${text}${emoji}`);
                          window.requestAnimationFrame(() => composerRef.current?.focus());
                        }
                      }}
                    />
                    </div>
                    {mobileEmojiTab === 'gif' && (
                      <div className="chat-menu-scroll h-[calc(100%_-_2.75rem)] overflow-y-auto p-2">
                        <form onSubmit={event => { event.preventDefault(); searchGifs(gifQuery); }} className="mb-2 flex gap-2"><input value={gifQuery} onChange={event => setGifQuery(event.target.value)} placeholder="Search GIFs" className="h-9 min-w-0 flex-1 rounded-full bg-obsidian px-4 text-sm outline-none" /><button className="rounded-full bg-brass px-4 text-xs text-obsidian">Search</button></form>
                        <div className="grid grid-cols-3 gap-1">{gifResults.map(gif => <button key={gif.id} type="button" onClick={() => { sendGif(gif); setEmojiMenuPosition(null); }} className="aspect-square overflow-hidden rounded-md bg-obsidian"><img src={gif.previewUrl || gif.url} alt={gif.title || 'GIF'} className="h-full w-full object-cover" /></button>)}</div>
                        {!gifConfigured && <p className="p-6 text-center text-xs text-ivory/50">GIF search is not configured yet.</p>}
                      </div>
                    )}
                    {mobileEmojiTab === 'stickers' && (
                      <div className="chat-menu-scroll grid h-[calc(100%_-_2.75rem)] grid-cols-4 content-start gap-2 overflow-y-auto p-4">{STICKERS.map(sticker => <button key={sticker} type="button" onClick={() => { sendSticker(sticker); setEmojiMenuPosition(null); }} className="chat-sticker-pop aspect-square rounded-xl bg-white/5 text-4xl hover:bg-brass/10">{sticker}</button>)}</div>
                    )}
                  </div>, document.body,
                )}
                {composerOptionsPosition && createPortal(
                  <div data-chat-popover style={composerOptionsPosition} className="fixed z-[240] overflow-hidden rounded-2xl border border-brass/20 bg-carbon p-2 text-xs shadow-2xl">
                    <button
                      type="button"
                      disabled={!attachments.length}
                      onClick={() => setViewOnce((value) => !value)}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left disabled:opacity-30 ${viewOnce ? 'bg-brass/10 text-brass' : 'text-ivory/65 hover:bg-white/5'}`}
                    >
                      <Eye size={16} />
                      <span className="flex-1">View once</span>
                      <span>{viewOnce ? 'On' : 'Off'}</span>
                    </button>
                    <label className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-ivory/65 hover:bg-white/5">
                      <Timer size={16} />
                      <span className="flex-1">Disappear</span>
                      <select value={disappearAfter} onChange={(event) => setDisappearAfter(Number(event.target.value))} className="max-w-24 bg-carbon text-right text-brass outline-none">
                        <option value="0">Off</option>
                        <option value="86400">24 hours</option>
                        <option value="604800">7 days</option>
                        <option value="7776000">90 days</option>
                      </select>
                    </label>
                  </div>, document.body,
                )}
              </footer>
            </>
          ) : (
            <div className="m-auto p-8 text-center">
              <MessageCircle className="mx-auto text-brass" size={34} />
              <p className="mt-4 font-display text-2xl text-ivory">Choose a conversation</p>
              <p className="mt-2 text-sm text-ivory/40">{adminMode ? 'Search people or continue an existing chat.' : 'Choose a studio conversation to continue.'}</p>
            </div>
          )}
        </section>
      </div>
      {showStickerPicker && createPortal(
        <div className="fixed inset-0 z-[225] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Choose a sticker" onMouseDown={event => { if (event.target === event.currentTarget) setShowStickerPicker(false); }}>
          <section className="w-full max-w-md rounded-t-3xl border border-brass/20 bg-carbon p-4 shadow-2xl sm:rounded-2xl">
            <header className="mb-3 flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-widest text-brass">Stickers</p><h3 className="font-display text-2xl text-ivory">Choose a reaction</h3></div><button type="button" onClick={() => setShowStickerPicker(false)} className="flex h-10 w-10 items-center justify-center"><X size={18} /></button></header>
            <div className="grid grid-cols-4 gap-2">{STICKERS.map(sticker => <button type="button" key={sticker} disabled={busy} onClick={() => sendSticker(sticker)} className="chat-sticker-pop flex aspect-square items-center justify-center rounded-2xl bg-obsidian text-5xl transition-colors hover:bg-brass/10 disabled:opacity-40">{sticker}</button>)}</div>
          </section>
        </div>, document.body,
      )}
      {showChatBrowser && createPortal(
        <div className="fixed inset-0 z-[225] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="chat-browser-title" onMouseDown={event => { if (event.target === event.currentTarget) setShowChatBrowser(false); }}>
          <section className="flex max-h-[88dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-brass/20 bg-carbon shadow-2xl">
            <header className="flex items-center justify-between border-b border-brass/15 p-4"><div><p className="text-[10px] uppercase tracking-widest text-brass">This conversation only</p><h3 id="chat-browser-title" className="font-display text-2xl text-ivory">Media, links and documents</h3></div><button type="button" onClick={() => setShowChatBrowser(false)} className="flex h-10 w-10 items-center justify-center"><X size={18} /></button></header>
            <div className="grid grid-cols-3 border-b border-brass/15 text-xs font-medium">
              {['media', 'links', 'documents'].map(tab => <button type="button" key={tab} onClick={() => setChatBrowserTab(tab)} className={`min-h-11 capitalize ${chatBrowserTab === tab ? 'bg-brass text-obsidian' : 'text-brass'}`}>{tab}</button>)}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {chatBrowserBusy && <div className="flex min-h-40 items-center justify-center"><Loader2 className="animate-spin text-brass" /></div>}
              {!chatBrowserBusy && (() => {
                const filtered = chatResources.filter(message => {
                  const type = messageAttachmentType(message);
                  if (chatBrowserTab === 'media') return message.attachmentUrl && /^(image|video|audio)\//.test(type);
                  if (chatBrowserTab === 'documents') return message.attachmentUrl && !/^(image|video|audio)\//.test(type);
                  return urlsInMessage(message.body).length > 0;
                });
                if (!filtered.length) return <p className="py-14 text-center text-sm text-ivory/40">No {chatBrowserTab} found in this conversation.</p>;
                return <div className={chatBrowserTab === 'media' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3'}>{filtered.map(message => {
                  const attachment = message.attachmentUrl ? {
                    url: studioClient.chat.attachmentUrl(message.id), previewUrl: studioClient.chat.attachmentUrl(message.id), downloadUrl: studioClient.chat.attachmentUrl(message.id, true),
                    name: message.decryptedAttachment?.name || message.attachmentName, type: message.decryptedAttachment?.type || message.attachmentType,
                    bytes: message.decryptedAttachment?.bytes || message.attachmentBytes, encryptedMetadata: message.decryptedAttachment || null, messageId: message.id,
                  } : null;
                  return <article key={message.id} className="rounded-xl border border-brass/15 bg-obsidian p-3"><div className="mb-2 flex items-center justify-between gap-2 text-[10px] text-ivory/40"><span className="truncate">{message.sender?.name || 'Participant'}</span><span>{new Date(message.created_date).toLocaleDateString()}</span></div>{chatBrowserTab === 'links' ? <div className="space-y-2">{urlsInMessage(message.body).map(url => <a key={url} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 break-all text-sm text-brass hover:underline"><ExternalLink size={13} className="shrink-0" />{url}</a>)}</div> : <AttachmentPreview attachment={attachment} onOpen={setPreview} />}</article>;
                })}</div>;
              })()}
            </div>
          </section>
        </div>, document.body,
      )}
      {showSavedBrowser && createPortal(
        <div className="fixed inset-0 z-[225] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="saved-browser-title">
          <section className="flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-brass/20 bg-carbon shadow-2xl">
            <header className="flex items-center justify-between border-b border-brass/15 p-4"><div><p className="text-[10px] uppercase tracking-widest text-brass">Private to your account</p><h3 id="saved-browser-title" className="font-display text-2xl text-ivory">Starred and saved</h3></div><button type="button" onClick={() => setShowSavedBrowser(false)} className="flex h-10 w-10 items-center justify-center"><X size={18} /></button></header>
            <div className="grid grid-cols-2 border-b border-brass/15 text-xs font-medium"><button type="button" onClick={() => setSavedTab('starred')} className={`min-h-11 ${savedTab === 'starred' ? 'bg-brass text-obsidian' : 'text-brass'}`}>Starred messages ({savedItems.starred.length})</button><button type="button" onClick={() => setSavedTab('media')} className={`min-h-11 ${savedTab === 'media' ? 'bg-brass text-obsidian' : 'text-brass'}`}>Saved media ({savedItems.media.length})</button></div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {savedBusy && <div className="flex min-h-40 items-center justify-center"><Loader2 className="animate-spin text-brass" /></div>}
              {!savedBusy && !(savedItems[savedTab] || []).length && <p className="py-14 text-center text-sm text-ivory/40">Nothing saved here yet.</p>}
              {!savedBusy && (savedItems[savedTab] || []).map(item => {
                const attachment = item.attachmentUrl ? {
                  url: studioClient.chat.attachmentUrl(item.id), previewUrl: studioClient.chat.attachmentUrl(item.id), downloadUrl: studioClient.chat.attachmentUrl(item.id, true),
                  name: item.decryptedAttachment?.name || item.attachmentName, type: item.decryptedAttachment?.type || item.attachmentType,
                  bytes: item.decryptedAttachment?.bytes || item.attachmentBytes, encryptedMetadata: item.decryptedAttachment || null, messageId: item.id,
                } : null;
                return <article key={item.id} className="rounded-xl border border-brass/15 bg-obsidian p-3"><div className="mb-2 flex items-center justify-between gap-3 text-[10px] text-ivory/40"><span className="truncate">{item.sender?.name || 'Account'}{item.conversationTitle ? ` · ${item.conversationTitle}` : ''}</span><span>{new Date(item.created_date).toLocaleDateString()}</span></div>{item.sticker && <div className="text-5xl">{item.sticker}</div>}{item.body && <p className="whitespace-pre-wrap text-sm text-ivory/75">{item.body}</p>}<AttachmentPreview attachment={attachment} onOpen={selected => { setShowSavedBrowser(false); setPreview(selected); }} /><button type="button" onClick={() => { setActiveId(item.conversationId); setMobileConversationOpen(true); setShowSavedBrowser(false); }} className="mt-3 text-xs font-medium text-brass">Open conversation</button></article>;
              })}
            </div>
          </section>
        </div>, document.body,
      )}
      {reactionPickerId &&
        reactionPickerPosition &&
        createPortal(
            <div data-chat-popover style={reactionPickerPosition} className="fixed z-[220] flex items-center justify-center gap-0.5 overflow-hidden rounded-full border border-brass/20 bg-carbon p-1.5 shadow-2xl">
            {REACTIONS.map((emoji) => (
              <button
                type="button"
                key={emoji}
                onClick={() => {
                  const message = messages.find((item) => item.id === reactionPickerId);
                  if (message) react(message, emoji);
                  setReactionPickerId('');
                  setReactionPickerPosition(null);
                }}
                className={`flex h-9 w-9 shrink-0 items-center justify-center text-lg ${messages.find((item) => item.id === reactionPickerId)?.reactions?.[user.id] === emoji ? 'bg-brass/15' : 'hover:bg-brass/10'}`}
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              onClick={(event) => {
                const targetId = reactionPickerId;
                setReactionPickerId('');
                setReactionPickerPosition(null);
                setEmojiReactionTarget(targetId);
                setEmojiMenuPosition(floatingPosition(event.currentTarget, 360, menuHeight(430)));
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ivory/70 hover:bg-brass/10"
              aria-label="Choose another emoji"
            >
              <Plus size={17} />
            </button>
          </div>,
          document.body,
        )}
      {messageMenuId &&
        messageMenuPosition &&
        (() => {
          const message = messages.find((item) => item.id === messageMenuId);
          if (!message) return null;
          const mine = message.senderId === user.id;
          const canEdit = mine && message.body && Date.now() - new Date(message.created_date).getTime() <= 2 * 60_000;
          const closeMenu = () => {
            setMessageMenuId('');
            setMessageMenuPosition(null);
          };
          return createPortal(
            <div data-chat-popover style={messageMenuPosition} className="chat-menu-scroll chat-menu-fade chat-menu-compact fixed z-[220] overflow-y-auto overscroll-contain rounded-xl border border-brass/20 bg-carbon px-1 shadow-2xl">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing({ id: message.id, body: message.body, encrypted: Boolean(message.ciphertext) });
                    closeMenu();
                  }}
                  className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-ivory/70 hover:bg-brass/10"
                >
                  <Pencil size={14} />
                  Edit message
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  starMessage(message);
                  closeMenu();
                }}
                className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"
              >
                <Star size={14} className={message.starredBy?.includes(user.id) ? 'fill-brass text-brass' : ''} />
                {message.starredBy?.includes(user.id) ? 'Unstar message' : 'Star message'}
              </button>
              {message.attachmentUrl && (
                <button
                  type="button"
                  onClick={() => {
                    saveMedia(message);
                    closeMenu();
                  }}
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"
                >
                  <Bookmark size={14} className={message.savedMediaBy?.includes(user.id) ? 'fill-brass text-brass' : ''} />
                  {message.savedMediaBy?.includes(user.id) ? 'Remove from saved media' : 'Save media'}
                </button>
              )}
              <button
                type="button"
                onClick={() => { pinMessage(message); closeMenu(); }}
                className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-ivory/70 hover:bg-brass/10"
              >
                <Pin size={14} className={message.pinned ? 'fill-brass text-brass' : ''} />
                {message.pinned ? 'Unpin message' : 'Pin message'}
              </button>
              {!message.ciphertext && (message.allowForward || ['admin', 'editor', 'support'].includes(user.role)) && (
                <button
                  type="button"
                  onClick={() => {
                    setForwardingMessage(message);
                    closeMenu();
                  }}
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"
                >
                  <Forward size={14} />
                  Forward
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  removeMessage(message, 'me');
                  closeMenu();
                }}
                className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"
              >
                <Trash2 size={14} />
                Delete for me
              </button>
              {mine && (
                <button
                  type="button"
                  onClick={() => {
                    removeMessage(message, 'everyone');
                    closeMenu();
                  }}
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-red-300 hover:bg-red-400/10"
                >
                  <Trash2 size={14} />
                  Delete for everyone
                </button>
              )}
            </div>,
            document.body,
          );
        })()}
      <PreviewOverlay attachment={preview} onClose={() => setPreview(null)} />
      {gifPickerOpen && (
        <GifPicker
          query={gifQuery}
          setQuery={setGifQuery}
          results={gifResults}
          loading={gifLoading}
          configured={gifConfigured}
          busy={busy}
          onSearch={searchGifs}
          onSend={sendGif}
          onClose={() => setGifPickerOpen(false)}
        />
      )}
      {shopPickerOpen && (
        <div
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShopPickerOpen(false);
              setSelectedProducts([]);
            }
          }}
          className="fixed inset-0 z-[176] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shop-picker-title"
        >
          <section className="flex max-h-[88dvh] w-full max-w-4xl flex-col border border-brass/25 bg-carbon shadow-2xl">
            <header className="flex items-center justify-between gap-3 border-b border-brass/15 p-4 sm:p-5">
              <div>
                <p className="text-[10px] uppercase tracking-[.25em] text-brass">{resourceCopy.eyebrow}</p>
                <h3 id="shop-picker-title" className="font-display text-2xl text-ivory sm:text-3xl">
                  {resourceCopy.title}
                </h3>
                <p className="mt-1 text-xs text-ivory/40">{resourceCopy.description}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShopPickerOpen(false);
                  setSelectedProducts([]);
                }}
                className="flex h-10 w-10 items-center justify-center border border-brass/15"
              >
                <X size={17} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
              {shopLoading ? (
                <div className="flex min-h-60 items-center justify-center">
                  <Loader2 className="animate-spin text-brass" />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {shopProducts.map((product) => {
                    const selected = selectedProducts.includes(product.id);
                    return (
                      <button
                        type="button"
                        key={product.id}
                        onClick={() => setSelectedProducts((current) => (selected ? current.filter((id) => id !== product.id) : [...current, product.id]))}
                        className={`overflow-hidden border text-left ${selected ? 'border-brass bg-brass/10' : 'border-brass/10 bg-obsidian'}`}
                      >
                        <div className="relative aspect-[4/3] bg-black/30">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <Image className="text-ivory/20" />
                            </div>
                          )}
                          {selected && (
                            <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-brass text-obsidian">
                              <CheckCheck size={15} />
                            </span>
                          )}
                        </div>
                        <div className="p-3">
                          <b title={product.title} className="block truncate text-sm text-ivory">
                            {product.title}
                          </b>
                          {resourceKind === 'shop' && (
                            <span className="mt-1 block text-sm text-brass">GHS {Number(product.price || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <footer className="flex items-center justify-between gap-3 border-t border-brass/15 p-4">
              <span className="text-xs text-ivory/40">{selectedProducts.length} selected</span>
              <button
                type="button"
                disabled={!selectedProducts.length || busy}
                onClick={sendShopSelection}
                className="min-h-11 bg-brass px-5 text-xs uppercase tracking-wider text-obsidian disabled:opacity-40"
              >
                {busy ? 'Sending…' : 'Send selected items'}
              </button>
            </footer>
          </section>
        </div>
      )}
      {showGroupBuilder && canCreateGroups && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="create-group-title">
          <form onSubmit={createGroup} className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-brass/20 bg-carbon shadow-2xl">
            <header className="flex items-center justify-between border-b border-brass/15 p-4">
              <div><h3 id="create-group-title" className="font-display text-2xl text-ivory">New group</h3><p className="text-xs text-ivory/40">You will be the group owner.</p></div>
              <button type="button" onClick={() => setShowGroupBuilder(false)} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/5" aria-label="Close"><X size={18} /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <label className="text-xs uppercase tracking-wider text-brass">Group name<input autoFocus value={groupTitle} onChange={event => setGroupTitle(event.target.value)} maxLength={100} className="mt-2 h-11 w-full border border-brass/15 bg-obsidian px-3 text-sm normal-case tracking-normal text-ivory outline-none" placeholder="Group name" /></label>
              <p className="mb-2 mt-5 text-xs uppercase tracking-wider text-brass">Choose members</p>
              <div className="space-y-1">
                {groupDirectory.map(person => {
                  const selected = selectedGroupMembers.includes(person.id);
                  return <button type="button" key={person.id} onClick={() => setSelectedGroupMembers(current => selected ? current.filter(id => id !== person.id) : [...current, person.id])} className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left ${selected ? 'bg-brass/15' : 'hover:bg-white/[0.03]'}`}>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brass/10 text-xs text-brass">{initials(person.name)}</span>
                    <span className="min-w-0 flex-1"><b className="block truncate text-sm text-ivory">{person.name}</b><small className="capitalize text-ivory/35">{person.role}</small></span>
                    {selected && <CheckCheck size={17} className="text-brass" />}
                  </button>;
                })}
              </div>
            </div>
            <footer className="flex items-center justify-between border-t border-brass/15 p-4"><span className="text-xs text-ivory/40">{selectedGroupMembers.length} selected</span><button disabled={groupBusy || !groupTitle.trim() || !selectedGroupMembers.length} className="min-h-11 rounded-full bg-brass px-6 text-xs font-semibold text-obsidian disabled:opacity-40">{groupBusy ? 'Creating…' : 'Create group'}</button></footer>
          </form>
        </div>
      )}
      {showGroupSettings && active?.type === 'group' && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="group-settings-title">
          <section className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-brass/20 bg-carbon shadow-2xl">
            <header className="flex items-center justify-between border-b border-brass/15 p-4">
              <div><h3 id="group-settings-title" className="font-display text-2xl text-ivory">{active.title}</h3><p className="text-xs capitalize text-ivory/40">Your role: {myGroupRole}</p></div>
              <button type="button" onClick={() => setShowGroupSettings(false)} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/5" aria-label="Close"><X size={18} /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {canManageActiveGroup && <button type="button" onClick={renameGroup} className="mb-3 min-h-9 border border-brass/20 px-3 text-xs text-brass">Rename group</button>}
              {active.participants.map(person => {
                const role = active.roles?.[person.id] || 'member';
                const protectedOwner = role === 'owner';
                return <div key={person.id} className="flex min-h-14 items-center gap-3 border-b border-brass/10 px-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brass/10 text-xs text-brass">{initials(person.name)}</span>
                  <span className="min-w-0 flex-1"><b className="block truncate text-sm text-ivory">{person.name}{person.id === user.id ? ' (you)' : ''}</b><small className="capitalize text-ivory/40">{role}</small></span>
                  {canManageActiveGroup && !protectedOwner && person.id !== user.id && <div className="flex gap-1"><button disabled={groupBusy} type="button" onClick={() => updateGroupMember(person.id, role === 'admin' ? 'member' : 'admin')} className="min-h-8 px-2 text-[10px] uppercase text-brass">{role === 'admin' ? 'Remove admin' : 'Make admin'}</button><button disabled={groupBusy} type="button" onClick={() => updateGroupMember(person.id, 'remove')} className="min-h-8 px-2 text-[10px] uppercase text-red-300">Remove</button></div>}
                </div>;
              })}
              {canManageActiveGroup && groupDirectory.filter(person => !active.participantIds.includes(person.id)).length > 0 && <><p className="mt-5 px-2 text-xs uppercase tracking-wider text-brass">Add people</p>{groupDirectory.filter(person => !active.participantIds.includes(person.id)).map(person => <button disabled={groupBusy} type="button" key={person.id} onClick={() => addGroupMember(person.id)} className="flex min-h-12 w-full items-center gap-3 px-2 text-left hover:bg-brass/10"><Plus size={15} className="text-brass" /><span className="text-sm text-ivory/70">{person.name}</span></button>)}</>}
            </div>
            {myGroupRole !== 'owner' && <footer className="border-t border-brass/15 p-4"><button type="button" onClick={leaveGroup} className="min-h-10 text-sm text-red-300">Leave group</button></footer>}
          </section>
        </div>
      )}
      {showStoryComposer && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="new-story-title">
          <form onSubmit={createStory} className="w-full max-w-md overflow-hidden rounded-2xl border border-brass/20 bg-carbon shadow-2xl">
            <header className="flex items-center justify-between border-b border-brass/15 p-4"><div><h3 id="new-story-title" className="font-display text-2xl text-ivory">New status</h3><p className="text-xs text-ivory/40">Automatically disappears after 24 hours.</p></div><button type="button" disabled={storyBusy} onClick={() => { clearStoryFile(); setShowStoryComposer(false); }} className="flex h-10 w-10 items-center justify-center disabled:opacity-30" aria-label="Close"><X size={18} /></button></header>
            <div className="space-y-4 p-4">
              <textarea value={storyBody} onChange={event => setStoryBody(event.target.value)} maxLength={1200} rows={5} placeholder="Share an update…" className="w-full resize-none rounded-xl border border-brass/15 bg-obsidian p-3 text-sm text-ivory outline-none" />
              {storyPreviewUrl && (
                <div className="relative overflow-hidden rounded-xl border border-brass/20 bg-black">
                  {storyFile?.type.startsWith('video/')
                    ? <video src={storyPreviewUrl} controls playsInline className="max-h-64 w-full object-contain" />
                    : <img src={storyPreviewUrl} alt="Status preview" className="max-h-64 w-full object-contain" />}
                  {!storyBusy && <button type="button" onClick={clearStoryFile} aria-label="Remove status media" className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/80 text-white"><X size={16} /></button>}
                  <p className="truncate border-t border-white/10 px-3 py-2 text-xs text-white/60">{storyFile?.name}</p>
                </div>
              )}
              <label className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-brass/30 text-xs text-brass ${storyBusy ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}><Image size={16} />{storyFile ? 'Change photo or video' : 'Add photo or video'}<input disabled={storyBusy} type="file" accept="image/*,video/*" className="hidden" onChange={selectStoryFile} /></label>
              {storyBusy && (
                <div aria-live="polite">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-ivory/55"><span>{storyUploadStage === 'publishing' ? 'Publishing status…' : 'Uploading media…'}</span><b className="text-brass">{storyUploadProgress}%</b></div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-brass transition-[width] duration-200" style={{ width: `${storyUploadProgress}%` }} /></div>
                </div>
              )}
            </div>
            <footer className="flex justify-end border-t border-brass/15 p-4"><button disabled={storyBusy || (!storyBody.trim() && !storyFile)} className="flex min-h-11 min-w-36 items-center justify-center gap-2 rounded-full bg-brass px-6 text-xs font-semibold text-obsidian disabled:opacity-40">{storyBusy && <Loader2 size={15} className="animate-spin" />}{storyBusy ? storyUploadStage === 'publishing' ? 'Publishing…' : `Uploading ${storyUploadProgress}%` : 'Share status'}</button></footer>
          </form>
        </div>
      )}
      {activeStory && (
        <div className="fixed inset-0 z-[195] flex items-center justify-center bg-black/95 p-4" role="dialog" aria-modal="true" aria-label="Status viewer">
          <section className="relative flex h-[min(44rem,94dvh)] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-obsidian shadow-2xl">
            <div className="absolute left-4 right-4 top-3 z-10 h-1 overflow-hidden rounded-full bg-white/20"><span className="block h-full w-full origin-left animate-[pulse_2s_ease-in-out_infinite] bg-white/80" /></div>
            <header className="absolute left-0 right-0 top-0 z-10 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent p-5 pt-7"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-brass/20 text-xs text-brass">{initials(activeStory.author?.name)}</span><span className="min-w-0 flex-1"><b className="block truncate text-sm text-white">{activeStory.mine ? 'Your status' : activeStory.author?.name}</b><small className="text-white/60">{new Date(activeStory.created_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span>{activeStory.mine && <button type="button" onClick={removeActiveStory} className="flex h-10 w-10 items-center justify-center text-red-300" aria-label="Delete status"><Trash2 size={18} /></button>}<button type="button" onClick={() => setActiveStory(null)} className="flex h-10 w-10 items-center justify-center text-white" aria-label="Close"><X size={20} /></button></header>
            <div className="flex min-h-0 flex-1 items-center justify-center bg-black pt-16">{activeStory.mediaUrl ? activeStory.mediaType?.startsWith('video/') ? <video src={activeStory.mediaUrl} controls autoPlay playsInline className="max-h-full w-full object-contain" /> : <img src={activeStory.mediaUrl} alt="Status" className="max-h-full w-full object-contain" /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brass/30 to-black p-10 text-center font-display text-3xl text-ivory">{activeStory.body}</div>}</div>
            {activeStory.mediaUrl && activeStory.body && <p className="absolute bottom-5 left-5 right-5 rounded-xl bg-black/60 p-3 text-center text-sm text-white">{activeStory.body}</p>}
            {activeStory.mine && <p className="absolute bottom-2 left-4 text-[10px] text-white/60">{activeStory.viewCount || 0} view{activeStory.viewCount === 1 ? '' : 's'}</p>}
          </section>
        </div>
      )}
      {showCallHistory && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="call-history-title">
          <section className="max-h-[80dvh] w-full max-w-lg overflow-hidden rounded-2xl border border-brass/20 bg-carbon shadow-2xl">
            <header className="flex items-center justify-between border-b border-brass/15 p-4">
              <div>
                <h3 id="call-history-title" className="font-display text-2xl text-ivory">Call history</h3>
                <p className="text-xs text-ivory/40">Incoming, outgoing, and missed calls across your devices</p>
              </div>
              <button type="button" onClick={() => setShowCallHistory(false)} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/5" aria-label="Close call history"><X size={18} /></button>
            </header>
            <div className="max-h-[60dvh] overflow-y-auto p-2">
              {!callHistory.length && <p className="p-6 text-center text-sm text-ivory/40">No calls yet.</p>}
              {callHistory.map(call => (
                <div key={call.id} className="flex min-h-16 items-center gap-3 border-b border-brass/10 px-3 py-2">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${call.status === 'missed' ? 'bg-red-500/10 text-red-300' : 'bg-brass/10 text-brass'}`}>
                    {call.kind === 'video' ? <Video size={18} /> : <Phone size={17} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm text-ivory">{call.peer?.name || 'Studio contact'}</b>
                    <small className={call.status === 'missed' ? 'text-red-300' : 'text-ivory/40'}>{call.direction === 'incoming' ? 'Incoming' : 'Outgoing'} · {call.status}</small>
                  </span>
                  <time className="shrink-0 text-[10px] text-ivory/35">{new Date(call.created_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</time>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      {structuredComposer && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <form
            onSubmit={(event) => { event.preventDefault(); sendStructuredMessage(structuredComposer.kind, structuredComposer); }}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-brass/20 bg-carbon shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-brass/15 p-4">
              <div><p className="text-[10px] uppercase tracking-[0.18em] text-brass">New message</p><h3 className="font-display text-2xl text-ivory">{structuredComposer.kind === 'poll' ? 'Create a poll' : 'Create an event'}</h3></div>
              <button type="button" onClick={() => setStructuredComposer(null)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5" aria-label="Close"><X size={18} /></button>
            </header>
            <div className="max-h-[65dvh] space-y-3 overflow-y-auto p-4">
              {structuredComposer.kind === 'poll' ? <>
                <input autoFocus required maxLength={240} value={structuredComposer.question} onChange={event => setStructuredComposer(current => ({ ...current, question: event.target.value }))} placeholder="Ask a question" className="min-h-12 w-full rounded-xl border border-brass/15 bg-obsidian px-4 text-sm text-ivory outline-none focus:border-brass" />
                {structuredComposer.options.map((option, index) => <div key={index} className="flex items-center gap-2"><input required maxLength={120} value={option} onChange={event => setStructuredComposer(current => ({ ...current, options: current.options.map((item, optionIndex) => optionIndex === index ? event.target.value : item) }))} placeholder={`Option ${index + 1}`} className="min-h-11 min-w-0 flex-1 rounded-xl border border-brass/15 bg-obsidian px-4 text-sm text-ivory outline-none focus:border-brass" />{structuredComposer.options.length > 2 && <button type="button" onClick={() => setStructuredComposer(current => ({ ...current, options: current.options.filter((_, optionIndex) => optionIndex !== index) }))} className="text-ivory/40"><X size={16} /></button>}</div>)}
                {structuredComposer.options.length < 8 && <button type="button" onClick={() => setStructuredComposer(current => ({ ...current, options: [...current.options, ''] }))} className="text-xs font-semibold text-brass">+ Add option</button>}
              </> : <>
                <input autoFocus required maxLength={180} value={structuredComposer.title} onChange={event => setStructuredComposer(current => ({ ...current, title: event.target.value }))} placeholder="Event title" className="min-h-12 w-full rounded-xl border border-brass/15 bg-obsidian px-4 text-sm text-ivory outline-none focus:border-brass" />
                <label className="block text-xs text-ivory/55">Starts<input required type="datetime-local" value={structuredComposer.startsAt} onChange={event => setStructuredComposer(current => ({ ...current, startsAt: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-brass/15 bg-obsidian px-4 text-sm text-ivory outline-none" /></label>
                <input maxLength={180} value={structuredComposer.location} onChange={event => setStructuredComposer(current => ({ ...current, location: event.target.value }))} placeholder="Location (optional)" className="min-h-11 w-full rounded-xl border border-brass/15 bg-obsidian px-4 text-sm text-ivory outline-none" />
                <textarea maxLength={1000} rows={3} value={structuredComposer.notes} onChange={event => setStructuredComposer(current => ({ ...current, notes: event.target.value }))} placeholder="Notes (optional)" className="w-full resize-none rounded-xl border border-brass/15 bg-obsidian p-4 text-sm text-ivory outline-none" />
              </>}
            </div>
            <footer className="flex justify-end border-t border-brass/15 p-4"><button disabled={busy} className="min-h-11 rounded-full bg-brass px-6 text-xs font-semibold text-obsidian disabled:opacity-40">{busy ? 'Sending…' : structuredComposer.kind === 'poll' ? 'Send poll' : 'Send event'}</button></footer>
          </form>
        </div>
      )}
      {currentCall && (
        <CallOverlay
          call={currentCall}
          currentUserId={user.id}
          rtcConfig={rtcConfig}
          signals={callSignals}
          onAccept={acceptCall}
          onClose={closeCall}
        />
      )}
      {forwardingMessage && (
        <div
          className="fixed inset-0 z-[175] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="forward-message-title"
        >
          <div className="max-h-[80dvh] w-full max-w-md overflow-hidden border border-brass/25 bg-carbon shadow-2xl">
            <header className="flex items-center justify-between border-b border-brass/15 p-4">
              <div>
                <h3 id="forward-message-title" className="font-display text-2xl text-ivory">
                  Forward message
                </h3>
                <p className="text-xs text-ivory/40">Choose one of your conversations</p>
              </div>
              <button
                type="button"
                onClick={() => setForwardingMessage(null)}
                aria-label="Close forward message"
                className="flex h-10 w-10 items-center justify-center border border-brass/15"
              >
                <X size={17} />
              </button>
            </header>
            <div className="max-h-[60dvh] overflow-y-auto p-2">
              {conversations
                .filter((item) => item.id !== activeId && !item.archived)
                .map((item) => (
                  <button
                    type="button"
                    disabled={busy}
                    key={item.id}
                    onClick={() => forwardMessage(item.id)}
                    className="flex min-h-14 w-full items-center gap-3 border-b border-brass/10 px-3 text-left hover:bg-brass/10 disabled:opacity-40"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brass/10 text-xs text-brass">{initials(conversationName(item, user.id))}</span>
                    <span className="truncate text-sm text-ivory/70">{conversationName(item, user.id)}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
