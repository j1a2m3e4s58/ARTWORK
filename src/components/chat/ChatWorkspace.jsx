import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  CheckCheck,
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

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const MAX_FILE_BYTES = 75 * 1024 * 1024;
const inferMimeType = (file) => {
  if (file?.type) return file.type;
  const extension = String(file?.name || '')
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

function VoiceMessagePlayer({ src, name = 'Voice message' }) {
  const audioRef = useRef(null);
  const animationRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [listened, setListened] = useState(false);
  const [playbackError, setPlaybackError] = useState('');
  const bars = [35, 58, 42, 78, 50, 88, 46, 66, 38, 82, 55, 72, 44, 64, 36, 76, 48, 60, 40, 70, 52, 84, 45, 62];
  const progress = duration ? Math.min(100, (current / duration) * 100) : 0;

  const synchronizeDuration = (player) => {
    const mediaDuration = Number(player?.duration);
    if (Number.isFinite(mediaDuration) && mediaDuration > 0) {
      setDuration(mediaDuration);
      return true;
    }
    return false;
  };

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
    <div className="flex min-w-0 max-w-full items-center gap-3 rounded-2xl bg-black/25 px-3 py-2 sm:min-w-[14rem]">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const player = event.currentTarget;
          if (!synchronizeDuration(player)) {
            // MediaRecorder WebM files can initially report Infinity/NaN. A
            // temporary seek asks Chromium/WebKit to parse the final cluster;
            // durationchange/seeked then expose the real length.
            const restoreAt = Number.isFinite(player.currentTime) ? player.currentTime : 0;
            const restore = () => {
              synchronizeDuration(player);
              player.currentTime = restoreAt;
              setCurrent(restoreAt);
            };
            player.addEventListener('durationchange', restore, { once: true });
            player.addEventListener('seeked', restore, { once: true });
            try {
              player.currentTime = Number.MAX_SAFE_INTEGER;
            } catch {
              setDuration(0);
            }
          }
          setCurrent(event.currentTarget.currentTime || 0);
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
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass text-obsidian transition-transform active:scale-95"
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
      >
        {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="relative flex h-9 w-full touch-none items-center overflow-hidden">
          <div className="flex h-8 w-full items-center justify-between gap-[2px]">
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
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass/10" title={name}>
        {listened ? <CheckCheck size={15} className="text-cyan-400" /> : <Mic size={15} className="text-brass" />}
      </span>
      <button
        type="button"
        onClick={cyclePlaybackRate}
        className="min-w-8 shrink-0 rounded-full border border-brass/15 px-1.5 py-1 text-[10px] font-semibold text-brass"
        aria-label={`Playback speed ${playbackRate} times`}
      >
        {playbackRate}×
      </button>
      {playbackError && <span role="alert" className="text-[10px] text-red-300" title={playbackError}>!</span>}
    </div>
  );
}

const MAX_VOICE_SECONDS = 5 * 60;
const MAX_VOICE_BYTES = 25 * 1024 * 1024;

function VoiceNoteRecorder({ onCancel, onReady, viewOnce, onViewOnceChange }) {
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
  const [phase, setPhase] = useState('starting');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState(() => Array(34).fill(8));
  const [preview, setPreview] = useState(null);
  const [notice, setNotice] = useState('Preparing microphone…');
  const [locked, setLocked] = useState(false);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') audioContextRef.current.close().catch(() => {});
    audioContextRef.current = null;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  };

  const finish = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive' || finalizingRef.current) return;
    finalizingRef.current = true;
    setPhase('finalizing');
    setNotice('Preparing your voice-note preview...');
    // Flush the encoder before stopping. Safari/iOS can otherwise create an
    // empty or incomplete MP4 when a paused recorder is resumed and stopped
    // immediately.
    try {
      recorder.requestData?.();
    } catch {
      // Other implementations flush automatically when stop() is called.
    }
    window.setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, 80);
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
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Recording is not supported by this browser.');
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const preferred = [
          'audio/mp4;codecs=mp4a.40.2',
          'audio/webm;codecs=opus',
          'audio/mp4',
          'audio/webm',
          'audio/ogg;codecs=opus',
        ].find((type) => MediaRecorder.isTypeSupported?.(type));
        const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
        recorderRef.current = recorder;
        chunksRef.current = [];
        recorder.ondataavailable = (event) => event.data?.size && chunksRef.current.push(event.data);
        recorder.onerror = (event) => {
          finalizingRef.current = false;
          setPhase('error');
          setNotice(event?.error?.message || 'Recording was interrupted. Please discard it and record again.');
        };
        recorder.onstop = () => {
          finalizingRef.current = false;
          const type = String(recorder.mimeType || preferred || 'audio/webm').split(';')[0].toLowerCase();
          const blob = new Blob(chunksRef.current, { type });
          stopTracks();
          if (disposedRef.current || discardRef.current) return;
          if (!blob.size) {
            setPhase('error');
            setNotice('No audio was captured. Check microphone access and record again.');
            return;
          }
          if (blob.size > MAX_VOICE_BYTES) {
            setPhase('error');
            setNotice('This voice note is larger than 25 MB. Please record a shorter note.');
            return;
          }
          const extension = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
          const file = new File([blob], `voice-message-${Date.now()}.${extension}`, { type });
          const url = URL.createObjectURL(file);
          setPreview((previous) => {
            if (previous?.url) URL.revokeObjectURL(previous.url);
            return { file, url };
          });
          setPhase('preview');
          setNotice('Preview your voice note before sending.');
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
        recorder.start(250);
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
    <div onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} className="min-w-0 flex-1 rounded-2xl border border-brass/20 bg-obsidian p-3 shadow-xl">
      {phase === 'preview' && preview ? (
        <div className="space-y-3">
          <VoiceMessagePlayer src={preview.url} name={preview.file.name} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={discard} className="flex min-h-10 items-center gap-2 rounded-full border border-red-400/35 px-4 text-xs text-red-300"><Trash2 size={15} /> Delete</button>
            <button type="button" onClick={() => onViewOnceChange(!viewOnce)} className={`flex min-h-10 items-center gap-2 rounded-full border px-4 text-xs ${viewOnce ? 'border-brass bg-brass/10 text-brass' : 'border-brass/20 text-ivory/55'}`}><Eye size={15} /> View once</button>
            <button type="button" onClick={() => onReady(preview.file, preview.url)} className="ml-auto flex min-h-10 items-center gap-2 rounded-full bg-brass px-5 text-xs font-semibold text-obsidian"><Send size={15} /> Attach to message</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
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
        </>
      )}
    </div>
  );
}

function QuotedMessage({ message }) {
  const media = message?.replyMediaPreview;
  const mediaType = String(media?.type || '').toLowerCase();
  const label = mediaType.startsWith('audio/')
    ? 'Voice message'
    : mediaType.startsWith('image/')
      ? 'Photo'
      : mediaType.startsWith('video/')
        ? 'Video'
        : media?.name || message?.replyPreview || 'Message';
  return (
    <div className="mb-2 flex min-w-0 items-center gap-2 overflow-hidden rounded-r-md border-l-4 border-brass bg-black/25 p-2 text-xs text-ivory/55">
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
        <b className="block text-[10px] uppercase tracking-wider text-brass">Reply</b>
        <span className="block truncate">{message?.replyPreview && !mediaType.startsWith('audio/') ? message.replyPreview : label}</span>
      </span>
    </div>
  );
}

function AttachmentPreview({ attachment, compact = false, onOpen }) {
  if (!attachment?.url) return null;
  const { url, name, type, bytes } = attachment;
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
  if (type?.startsWith('audio/'))
    return (
      <div className="mt-2 w-full min-w-0 max-w-full border border-brass/15 bg-obsidian p-3">
        <VoiceMessagePlayer src={url} name={name} />
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

export default function ChatWorkspace({ adminMode = false }) {
  const { user } = useAuth();
  const isIos = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const isInstalledIos = typeof navigator !== 'undefined' && navigator.standalone === true;
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
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const messagesPaneRef = useRef(null);
  const attachmentsRef = useRef([]);
  const uploadAbortRef = useRef(null);
  const photosInputRef = useRef(null);
  const documentsInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const composerRef = useRef(null);
  const typingTimerRef = useRef(null);
  const initializedSelectionRef = useRef(false);
  const typingLastSentRef = useRef({ value: false, at: 0 });
  const activeIdRef = useRef('');
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
  const setText = (value) =>
    setDrafts((current) => ({
      ...current,
      [activeId]: typeof value === 'function' ? value(current[activeId] || '') : value,
    }));
  const floatingPosition = (element, preferredWidth, preferredHeight) => {
    const rect = element.getBoundingClientRect();
    const gutter = 12;
    const width = Math.min(preferredWidth, window.innerWidth - gutter * 2);
    const left = Math.min(window.innerWidth - width - gutter, Math.max(gutter, rect.right - width));
    const below = window.innerHeight - rect.bottom;
    const top = below >= preferredHeight + 8 ? rect.bottom + 8 : Math.max(gutter, rect.top - preferredHeight - 8);
    return {
      left,
      top,
      width,
      maxHeight: Math.max(120, window.innerHeight - top - gutter),
    };
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
          await studioClient.chat.send(item.conversationId, item.payload);
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
      setShowConversationMenu(false);
      setMessageMenuId('');
      setReactionPickerId('');
      setMessageMenuPosition(null);
      setReactionPickerPosition(null);
    };
    const closeWithEscape = (event) => {
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
    const currentProfiles = new Map(people.map((person) => [person.id, person]));
    const hydratedConversations = conversationRows.map((conversation) => ({
      ...conversation,
      participants: (conversation.participants || []).map((person) => ({
        ...person,
        ...(currentProfiles.get(person.id) || {}),
      })),
    }));
    setConversations(hydratedConversations);
    setDirectory(people);
    if (!initializedSelectionRef.current && hydratedConversations[0]) {
      initializedSelectionRef.current = true;
      const requestedId = new URLSearchParams(window.location.search).get('conversation');
      setActiveId(hydratedConversations.some((row) => row.id === requestedId) ? requestedId : hydratedConversations[0].id);
    }
  };
  const loadMessages = async (id, search = messageQuery, options = {}) => {
    if (!id) return;
    const pane = messagesPaneRef.current;
    const distanceFromBottom = pane ? pane.scrollHeight - pane.scrollTop - pane.clientHeight : Number.POSITIVE_INFINITY;
    const shouldFollowLatest = options.scrollToBottom || distanceFromBottom < 120;
    const response = await studioClient.chat.messages(id, {
      query: search,
      before: options.before || '',
      limit: 60,
    });
    const rows = Array.isArray(response) ? response : response.items || [];
    setNextCursor(Array.isArray(response) ? null : response.nextCursor || null);
    setMessages((current) =>
      options.mergeLatest
        ? [...new Map([...current, ...rows].map((item) => [item.id, item])).values()].sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)))
        : rows,
    );
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
        else if (shouldFollowLatest) currentPane.scrollTop = currentPane.scrollHeight;
      }),
    );
  };

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
      if (activeId) loadMessages(activeId, '', { mergeLatest: true }).catch(() => setConnectionState('offline'));
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
      if (payload.conversationId === activeIdRef.current) loadMessages(payload.conversationId, '', { mergeLatest: true }).catch(() => setConnectionState('offline'));
    };
    ['message', 'read', 'typing', 'conversation'].forEach((name) => stream.addEventListener(name, refresh));
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
    setAttachments((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
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
      attachmentsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  const active = conversations.find((conversation) => conversation.id === activeId);
  const other = active?.participants?.find((person) => person.id !== user.id);
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
  const chooseFiles = async (selectedFiles) => {
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
          if (!isHeic) return item;
          const { default: convertHeic } = await import('heic2any');
          const converted = await convertHeic({
            blob: item,
            toType: 'image/jpeg',
            quality: 0.9,
          });
          const jpeg = Array.isArray(converted) ? converted[0] : converted;
          return new File([jpeg], item.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg', lastModified: item.lastModified });
        }),
      );
      const additions = normalized.map((item) => ({
        id: `${Date.now()}-${crypto.randomUUID?.() || Math.random()}`,
        file: item,
        mime: inferMimeType(item),
        previewUrl: URL.createObjectURL(item),
      }));
      setAttachments((current) => [...current, ...additions].slice(0, 10));
      if (selected.length > availableSlots) setError('You can attach up to 10 files to one send.');
    } catch {
      setError('This phone photo could not be prepared. Try selecting it from Photos again or save it as JPG first.');
    }
  };
  const removeAttachment = (id) =>
    setAttachments((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((item) => item.id !== id);
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
    if (!gif?.url || !activeId || busy) return;
    setBusy(true);
    setError('');
    try {
      const imported = await studioClient.chat.importGif(gif.id);
      await studioClient.chat.send(activeId, {
        clientId: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        body: '',
        attachmentUrl: imported.file_url,
        attachmentName: imported.media?.filename || gif.title || 'GIF',
        attachmentType: imported.media?.mime || 'image/gif',
        attachmentBytes: imported.media?.bytes || 0,
        allowForward: true,
      });
      setGifPickerOpen(false);
      await loadMessages(activeId, '', { scrollToBottom: true });
      await load();
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setBusy(false);
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
  const send = async () => {
    if ((!text.trim() && !attachments.length) || !activeId) return;
    setBusy(true);
    setUploadFailed(false);
    setUploadProgress(Object.fromEntries(attachments.map((item) => [item.id, 1])));
    setError('');
    try {
      if (!attachments.length) {
        await studioClient.chat.send(activeId, {
          clientId: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
          body: text.trim(),
          replyToId: replyingTo?.id || null,
          expiresInSeconds: disappearAfter,
          allowForward: false,
        });
      } else {
        uploadAbortRef.current = new AbortController();
        const messages = [];
        for (let index = 0; index < attachments.length; index += 1) {
          const item = attachments[index];
          const uploaded = await studioClient.integrations.Core.UploadFileProgress({
            file: item.file,
            purpose: 'chat-attachment',
            signal: uploadAbortRef.current.signal,
            onProgress: (progress) =>
              setUploadProgress((current) => ({
                ...current,
                [item.id]: progress,
              })),
          });
          messages.push({
            clientId: crypto.randomUUID?.() || `${Date.now()}-${index}-${Math.random()}`,
            body: index === 0 ? text.trim() : '',
            attachmentUrl: uploaded.file_url,
            attachmentName: item.file.name,
            // Preserve the format recorded by the device. iPhone/Safari emits
            // MP4/M4A while Chromium generally emits WebM; forcing WebM makes
            // valid iPhone recordings fail preview and playback after upload.
            attachmentType: uploaded.media?.mime || item.mime || item.file.type || 'application/octet-stream',
            attachmentBytes: item.file.size,
            replyToId: index === 0 ? replyingTo?.id || null : null,
            viewOnce,
            expiresInSeconds: disappearAfter,
            allowForward: false,
          });
        }
        await studioClient.chat.sendBatch(activeId, messages);
      }
      setText('');
      attachments.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setAttachments([]);
      setReplyingTo(null);
      setViewOnce(false);
      setUploadProgress({});
      await loadMessages(activeId, '', { scrollToBottom: true });
      await load();
    } catch (sendError) {
      if (!attachments.length && (!navigator.onLine || /fetch|network|offline/i.test(String(sendError.message)))) {
        const queued = {
          conversationId: activeId,
          payload: {
            clientId: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
            body: text.trim(),
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
        return;
      }
      setUploadFailed(Boolean(attachments.length) && sendError.name !== 'AbortError');
      setError(sendError.name === 'AbortError' ? 'Upload cancelled. Your files are still ready to retry.' : sendError.message);
    } finally {
      setBusy(false);
      uploadAbortRef.current = null;
    }
  };
  const shareLocation = () => {
    setShowAttachmentMenu(false);
    if (!navigator.geolocation) {
      setError('Location sharing is not supported by this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await studioClient.chat.send(activeId, {
            clientId: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
            body: 'Shared location',
            sharedLocation: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            },
            expiresInSeconds: disappearAfter,
          });
          await loadMessages(activeId, '', { scrollToBottom: true });
          await load();
        } catch (shareError) {
          setError(shareError.message);
        }
      },
      () => setError('Location permission was not granted.'),
    );
  };
  const shareContact = async () => {
    setShowAttachmentMenu(false);
    const name = window.prompt('Contact name');
    if (!name) return;
    const phone = window.prompt('Phone number (include country code)');
    if (!phone) return;
    try {
      await studioClient.chat.send(activeId, {
        clientId: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        sharedContact: { name, phone },
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
      await studioClient.chat.startCall(activeId, kind);
      setError(`${kind === 'video' ? 'Video' : 'Voice'} call invitation sent. Calls require camera/microphone permission and a configured TURN server for reliable connections.`);
    } catch (callError) {
      setError(callError.message);
    }
  };
  const setForwarding = async (message) => {
    await studioClient.chat.setForwarding(message.id, !message.allowForward);
    await loadMessages(activeId);
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
    await loadMessages(activeId);
  };
  const starMessage = async (message) => {
    await studioClient.chat.star(message.id, !(message.starredBy || []).includes(user.id));
    await loadMessages(activeId);
  };
  const saveEdit = async () => {
    if (!editing?.body?.trim()) return;
    setBusy(true);
    try {
      await studioClient.chat.edit(editing.id, editing.body);
      setEditing(null);
      await loadMessages(activeId);
      await load();
    } catch (editError) {
      setError(editError.message);
    } finally {
      setBusy(false);
    }
  };
  const removeMessage = async (message, mode) => {
    try {
      await studioClient.chat.remove(message.id, mode);
      await loadMessages(activeId);
      await load();
    } catch (removeError) {
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
      await loadMessages(activeId, messageQuery, { scrollToTop: true });
    } catch (searchError) {
      setError(searchError.message);
    } finally {
      setSearchBusy(false);
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
      const older = response.items || [];
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
    if (pane) pane.scrollTo({ top: pane.scrollHeight, behavior: 'smooth' });
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
  const attachRecordedVoice = (voiceFile, previewUrl) => {
    setAttachments((current) => [
      ...current,
      {
        id: `voice-${Date.now()}`,
        file: voiceFile,
        mime: voiceFile.type || 'audio/webm',
        previewUrl,
      },
    ]);
    setRecording(false);
  };

  return (
    <>
      <div
        className={`grid min-h-0 max-w-full overflow-hidden bg-carbon md:border md:border-brass/15 lg:grid-cols-[minmax(280px,330px)_minmax(0,1fr)] ${adminMode ? 'h-[clamp(360px,calc(100dvh-13rem),760px)]' : 'h-full'}`}
      >
        <aside className={`${mobileConversationOpen ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-col overflow-hidden border-r border-brass/15`}>
          <div className="shrink-0 border-b border-brass/15 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {!adminMode && (
                  <Link to="/" aria-label="Return to the studio" className="flex h-9 w-9 shrink-0 items-center justify-center border border-brass/15 text-brass lg:hidden">
                    <ArrowLeft size={17} />
                  </Link>
                )}
                <h2 className="truncate font-display text-2xl text-ivory">{adminMode ? 'Studio conversations' : 'Messages'}</h2>
              </div>
              <div className="flex items-center gap-1">
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
                        <span className="m-auto">{initials(person?.name)}</span>
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
                    <small className="block truncate text-ivory/35">
                      {conversation.typingUsers?.length ? `${conversation.typingUsers[0].name} is typing…` : conversation.lastMessage || 'Conversation started'}
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
              <header className="shrink-0 flex items-center gap-2 border-b border-brass/15 p-3 sm:gap-3 sm:p-4">
                <button
                  onClick={() => setMobileConversationOpen(false)}
                  className="flex h-10 w-10 items-center justify-center text-brass lg:hidden"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft size={19} />
                </button>
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass/10 text-xs font-semibold text-brass">
                  <span className="flex h-full w-full overflow-hidden rounded-full">
                    {active.type === 'announcement' ? (
                      <span className="m-auto">
                        <Megaphone size={17} />
                      </span>
                    ) : other?.avatarUrl ? (
                      <img src={other.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="m-auto">{initials(other?.name)}</span>
                    )}
                  </span>
                  {other?.online && <i className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-carbon bg-green-400" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-xl text-ivory">{conversationName(active, user.id)}</p>
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
                  <>
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
                    onClick={() => setShowConversationMenu((value) => !value)}
                    className="flex h-10 w-10 items-center justify-center text-ivory/55 hover:text-brass"
                    aria-label="Conversation options"
                  >
                    <MoreVertical size={18} />
                  </button>
                  {showConversationMenu && (
                    <div data-chat-popover className="absolute right-0 top-11 z-30 w-52 border border-brass/20 bg-carbon p-1 shadow-2xl">
                      <button
                        type="button"
                        onClick={() => updateConversation({ muted: !active.muted })}
                        className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-ivory/65 hover:bg-brass/10"
                      >
                        {active.muted ? <Bell size={15} /> : <BellOff size={15} />}
                        {active.muted ? 'Unmute alerts' : 'Mute alerts'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConversation({ favourite: !active.favourite })}
                        className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-ivory/65 hover:bg-brass/10"
                      >
                        <Star size={15} className={active.favourite ? 'fill-brass text-brass' : ''} />
                        {active.favourite ? 'Remove favourite' : 'Add to favourites'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConversation({ pinned: !active.pinned })}
                        className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-ivory/65 hover:bg-brass/10"
                      >
                        <Pin size={15} />
                        {active.pinned ? 'Unpin chat' : 'Pin chat'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConversation({ markUnread: true })}
                        className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-ivory/65 hover:bg-brass/10"
                      >
                        <Mail size={15} />
                        Mark as unread
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConversation({ archived: !active.archived })}
                        className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-ivory/65 hover:bg-brass/10"
                      >
                        <Archive size={15} />
                        {active.archived ? 'Restore chat' : 'Archive chat'}
                      </button>
                      {active.type !== 'announcement' && (
                        <button
                          type="button"
                          onClick={() => updateConversation({ blocked: !active.blockedByMe })}
                          className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-red-300 hover:bg-red-400/10"
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
                          className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-red-300 hover:bg-red-400/10"
                        >
                          <Flag size={15} />
                          Report conversation
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </header>
              {searchingMessages && (
                <form onSubmit={runMessageSearch} className="flex gap-2 border-b border-brass/15 bg-carbon p-3">
                  <label className="flex min-w-0 flex-1 items-center gap-2 border border-brass/15 bg-obsidian px-3">
                    <Search size={14} className="text-brass" />
                    <input
                      autoFocus
                      value={messageQuery}
                      onChange={(event) => setMessageQuery(event.target.value)}
                      placeholder="Search messages and files"
                      className="h-10 min-w-0 flex-1 bg-transparent text-sm text-ivory outline-none"
                    />
                  </label>
                  <button disabled={searchBusy} className="h-10 border border-brass/20 px-3 text-xs text-brass disabled:opacity-40">
                    {searchBusy ? 'Searching…' : 'Search'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMessageQuery('');
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
                className="relative min-h-0 min-w-0 flex-1 space-y-3 overscroll-contain overflow-x-hidden overflow-y-auto bg-obsidian/35 p-3 [scrollbar-gutter:stable] sm:p-6"
              >
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
                {messages.map((message, index) => {
                  const mine = message.senderId === user.id;
                  const attachment = message.attachmentUrl
                    ? {
                        url: message.attachmentUrl,
                        previewUrl: studioClient.chat.attachmentUrl(message.id),
                        downloadUrl: studioClient.chat.attachmentUrl(message.id, true),
                        name: message.attachmentName,
                        type: message.attachmentType,
                        bytes: message.attachmentBytes,
                        messageId: message.id,
                      }
                    : null;
                  const groupedReactions = Object.values(message.reactions || {}).reduce(
                    (result, emoji) => ({
                      ...result,
                      [emoji]: (result[emoji] || 0) + 1,
                    }),
                    {},
                  );
                  const previous = messages[index - 1];
                  const showDate = !previous || new Date(previous.created_date).toDateString() !== new Date(message.created_date).toDateString();
                  return (
                    <div key={message.id} className="min-w-0 max-w-full">
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
                      <div className={`group flex min-w-0 max-w-full ${mine ? 'justify-end' : 'justify-start'}`}>
                        <article className={`relative min-w-0 max-w-[90%] border p-3 sm:max-w-[72%] ${mine ? 'border-brass/20 bg-brass/10' : 'border-ivory/10 bg-carbon'}`}>
                          {message.replyPreview && <QuotedMessage message={message} />}
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
                            message.body && <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-ivory/75">{message.body}</p>
                          )}
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
                          {message.sharedLocation && (
                            <a
                              href={`https://www.google.com/maps?q=${encodeURIComponent(`${message.sharedLocation.latitude},${message.sharedLocation.longitude}`)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 flex items-center gap-3 border border-brass/15 bg-obsidian p-3 text-sm text-brass"
                            >
                              <MapPin size={20} />
                              <span>
                                <b className="block text-ivory">Shared location</b>
                                <small>Open safely in Maps</small>
                              </span>
                            </a>
                          )}
                          {message.sharedContact && (
                            <a
                              href={`tel:${String(message.sharedContact.phone || '').replace(/[^+\d]/g, '')}`}
                              className="mt-3 flex items-center gap-3 border border-brass/15 bg-obsidian p-3 text-sm text-brass"
                            >
                              <Contact size={20} />
                              <span>
                                <b className="block text-ivory">{message.sharedContact.name}</b>
                                <small>{message.sharedContact.phone}</small>
                              </span>
                            </a>
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
                          {attachment?.type?.startsWith('audio/') && (
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
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
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
                                    setReactionPickerId(opening ? message.id : '');
                                    setReactionPickerPosition(opening ? floatingPosition(event.currentTarget, 238, 60) : null);
                                    setMessageMenuId('');
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
                                    setMessageMenuId(opening ? message.id : '');
                                    setMessageMenuPosition(opening ? floatingPosition(event.currentTarget, 220, 190) : null);
                                    setReactionPickerId('');
                                  }}
                                  title="Message options"
                                  className="flex h-7 w-7 items-center justify-center text-ivory/30 hover:text-brass"
                                >
                                  <MoreVertical size={13} />
                                </button>
                              </div>
                            )}
                            <div className="flex items-center gap-1 text-[10px] text-ivory/30">
                              {message.editedAt && <span>edited · </span>}
                              {new Date(message.created_date).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                              {mine && <CheckCheck size={13} aria-label={message.readAt ? 'Read' : 'Delivered'} className={message.readAt ? 'text-sky-400' : 'text-ivory/35'} />}
                            </div>
                          </div>
                          {Object.keys(groupedReactions).length > 0 && (
                            <div className="absolute -bottom-3 right-2 rounded-full border border-brass/15 bg-carbon px-2 py-0.5 text-xs shadow-lg">
                              {Object.entries(groupedReactions).map(([emoji, count]) => (
                                <span key={emoji} className="mr-1">
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
                {!messages.length && (
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
              <footer className="shrink-0 border-t border-brass/15 bg-carbon p-2.5 sm:p-3">
                {replyingTo && (
                  <div className="relative mb-2 pr-9">
                    <QuotedMessage
                      message={{
                        replyPreview: replyingTo.body || replyingTo.attachmentName || 'Message',
                        replyMediaPreview: replyingTo.attachmentUrl
                          ? {
                              type: replyingTo.attachmentType,
                              name: replyingTo.attachmentName,
                              url: replyingTo.attachmentUrl,
                            }
                          : null,
                      }}
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
                  <div className="mb-2 min-w-0 max-w-full overflow-hidden border border-brass/15 bg-obsidian p-2">
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
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-2">
                  <div data-chat-popover className="relative">
                    <button
                      type="button"
                      disabled={active.blocked || (active.type === 'announcement' && !adminMode)}
                      onClick={() => setShowAttachmentMenu((value) => !value)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center border border-brass/20 text-brass disabled:cursor-not-allowed disabled:opacity-40"
                      title="Add an attachment"
                      aria-label="Open attachment menu"
                    >
                      <Paperclip size={17} />
                    </button>
                    {showAttachmentMenu && (
                      <div className="absolute bottom-12 left-0 z-50 w-[min(15rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden border border-brass/20 bg-carbon p-1 shadow-2xl">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAttachmentMenu(false);
                            photosInputRef.current?.click();
                          }}
                          className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"
                        >
                          <Image size={17} className="text-sky-400" />
                          <span>
                            <b className="block font-medium">Photos & videos</b>
                            <small className="text-ivory/35">Choose one or several</small>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAttachmentMenu(false);
                            documentsInputRef.current?.click();
                          }}
                          className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"
                        >
                          <FileText size={17} className="text-purple-400" />
                          <span>
                            <b className="block font-medium">Documents</b>
                            <small className="text-ivory/35">PDF, Word, Excel, slides or ZIP</small>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAttachmentMenu(false);
                            audioInputRef.current?.click();
                          }}
                          className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"
                        >
                          <Mic size={17} className="text-orange-400" />
                          <span>
                            <b className="block font-medium">Audio</b>
                            <small className="text-ivory/35">Choose an audio recording</small>
                          </span>
                        </button>
                        <button type="button" onClick={openGifPicker} className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10">
                          <span className="flex h-[18px] min-w-[27px] items-center justify-center rounded-sm bg-gradient-to-r from-fuchsia-500 via-cyan-400 to-emerald-400 px-1 text-[8px] font-bold tracking-wide text-black">
                            GIF
                          </span>
                          <span>
                            <b className="block font-medium">GIFs</b>
                            <small className="text-ivory/35">Search and send with GIPHY</small>
                          </span>
                        </button>
                        <button type="button" onClick={shareLocation} className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10">
                          <MapPin size={17} className="text-green-400" />
                          <span>
                            <b className="block font-medium">Location</b>
                            <small className="text-ivory/35">Share your current position</small>
                          </span>
                        </button>
                        <button type="button" onClick={shareContact} className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10">
                          <Contact size={17} className="text-cyan-400" />
                          <span>
                            <b className="block font-medium">Contact</b>
                            <small className="text-ivory/35">Share a name and phone number</small>
                          </span>
                        </button>
                        <button type="button" onClick={openShopPicker} className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10">
                          <ShoppingBag size={17} className="text-brass" />
                          <span>
                            <b className="block font-medium">Art Shop items</b>
                            <small className="text-ivory/35">Share items for discussion</small>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openResourcePicker('gallery')}
                          className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"
                        >
                          <Images size={17} className="text-emerald-400" />
                          <span>
                            <b className="block font-medium">Gallery artworks</b>
                            <small className="text-ivory/35">Share finished works</small>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openResourcePicker('films')}
                          className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"
                        >
                          <Clapperboard size={17} className="text-violet-400" />
                          <span>
                            <b className="block font-medium">Art Films</b>
                            <small className="text-ivory/35">Share a studio film</small>
                          </span>
                        </button>
                      </div>
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
                  </div>
                  {recording ? (
                    <VoiceNoteRecorder
                      onCancel={cancelRecording}
                      onReady={attachRecordedVoice}
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
                      rows={2}
                      placeholder={active.type === 'announcement' && !adminMode ? 'Community Updates is read-only for members' : 'Write a message…'}
                      className="min-w-0 flex-1 resize-none rounded-2xl border border-brass/20 bg-obsidian px-4 py-3 text-sm text-ivory outline-none disabled:opacity-50"
                    />
                  )}
                  {!recording && (text.trim() || attachments.length) ? (
                    <button
                      disabled={busy || active.blocked || (active.type === 'announcement' && !adminMode)}
                      onClick={send}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brass text-obsidian disabled:opacity-40"
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
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brass/20 bg-brass text-obsidian disabled:opacity-40"
                    >
                      <Mic size={18} />
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider">
                  <button
                    type="button"
                    disabled={!attachments.length}
                    onClick={() => setViewOnce((value) => !value)}
                    className={`flex min-h-8 items-center gap-1.5 border px-3 disabled:opacity-30 ${viewOnce ? 'border-brass bg-brass/10 text-brass' : 'border-brass/15 text-ivory/40'}`}
                  >
                    <Eye size={12} />
                    View once
                  </button>
                  <label className="flex min-h-8 items-center gap-2 border border-brass/15 px-3 text-ivory/40">
                    <Timer size={12} />
                    <span>Disappear</span>
                    <select value={disappearAfter} onChange={(event) => setDisappearAfter(Number(event.target.value))} className="bg-carbon text-brass outline-none">
                      <option value="0">Off</option>
                      <option value="86400">24 hours</option>
                      <option value="604800">7 days</option>
                      <option value="7776000">90 days</option>
                    </select>
                  </label>
                </div>
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
      {reactionPickerId &&
        reactionPickerPosition &&
        createPortal(
          <div data-chat-popover style={reactionPickerPosition} className="fixed z-[220] flex gap-1 overflow-x-auto border border-brass/20 bg-carbon p-2 shadow-2xl">
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
          </div>,
          document.body,
        )}
      {messageMenuId &&
        messageMenuPosition &&
        (() => {
          const message = messages.find((item) => item.id === messageMenuId);
          if (!message) return null;
          const mine = message.senderId === user.id;
          const closeMenu = () => {
            setMessageMenuId('');
            setMessageMenuPosition(null);
          };
          return createPortal(
            <div data-chat-popover style={messageMenuPosition} className="fixed z-[220] overflow-y-auto border border-brass/20 bg-carbon p-1 shadow-2xl">
              {mine && message.body && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing({ id: message.id, body: message.body });
                    closeMenu();
                  }}
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-ivory/70 hover:bg-brass/10"
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
              {(message.allowForward || ['admin', 'editor', 'support'].includes(user.role)) && (
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
