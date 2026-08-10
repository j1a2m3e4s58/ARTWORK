import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import { studioClient } from '@/api/studioClient';

const terminalStatuses = new Set(['rejected', 'ended', 'missed']);

export default function CallOverlay({ call, currentUserId, rtcConfig, signals, onAccept, onClose }) {
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const handledSignalsRef = useRef(0);
  const pendingCandidatesRef = useRef([]);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [acceptedLocally, setAcceptedLocally] = useState(call.initiatorId === currentUserId);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(call.kind !== 'video');
  const [statusText, setStatusText] = useState(call.initiatorId === currentUserId ? 'Calling…' : 'Incoming call');
  const incoming = call.initiatorId !== currentUserId;

  const stopMedia = () => {
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    remoteStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
  };

  const sendSignal = signal => studioClient.chat.signalCall(call.id, { signal }).catch(() => setStatusText('Connection interrupted'));

  const ensurePeer = async () => {
    if (peerRef.current) return peerRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: call.kind === 'video' ? { facingMode: 'user' } : false,
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    const peer = new RTCPeerConnection({ iceServers: rtcConfig?.iceServers || [] });
    peerRef.current = peer;
    remoteStreamRef.current = new MediaStream();
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
    stream.getTracks().forEach(track => peer.addTrack(track, stream));
    peer.ontrack = event => event.streams[0]?.getTracks().forEach(track => {
      if (!remoteStreamRef.current.getTracks().some(item => item.id === track.id)) remoteStreamRef.current.addTrack(track);
    });
    peer.onicecandidate = event => { if (event.candidate) sendSignal({ type: 'candidate', candidate: event.candidate.toJSON() }); };
    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === 'connected') setStatusText('Connected');
      else if (state === 'failed') setStatusText('Call connection failed');
      else if (state === 'disconnected') setStatusText('Reconnecting…');
    };
    return peer;
  };

  const applySignal = async signal => {
    const peer = await ensurePeer();
    if (signal.type === 'offer') {
      await peer.setRemoteDescription(signal.description);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendSignal({ type: 'answer', description: peer.localDescription });
    } else if (signal.type === 'answer') {
      await peer.setRemoteDescription(signal.description);
    } else if (signal.type === 'candidate' && signal.candidate) {
      if (peer.remoteDescription) await peer.addIceCandidate(signal.candidate);
      else pendingCandidatesRef.current.push(signal.candidate);
    }
    if (peer.remoteDescription && pendingCandidatesRef.current.length) {
      const candidates = pendingCandidatesRef.current.splice(0);
      await Promise.all(candidates.map(candidate => peer.addIceCandidate(candidate).catch(() => {})));
    }
  };

  useEffect(() => {
    if (incoming || !acceptedLocally) return undefined;
    let cancelled = false;
    ensurePeer().then(async peer => {
      if (cancelled || peer.localDescription) return;
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendSignal({ type: 'offer', description: peer.localDescription });
    }).catch(error => setStatusText(error.message || 'Camera or microphone permission was denied.'));
    return () => { cancelled = true; };
  }, [acceptedLocally, incoming]);

  useEffect(() => {
    if (!acceptedLocally) return;
    const unhandled = signals.slice(handledSignalsRef.current);
    handledSignalsRef.current = signals.length;
    unhandled.reduce((chain, item) => chain.then(() => applySignal(item)), Promise.resolve())
      .catch(error => setStatusText(error.message || 'Could not establish the call.'));
  }, [signals, acceptedLocally]);

  useEffect(() => {
    if (call.status === 'accepted') setStatusText('Connecting…');
    if (terminalStatuses.has(call.status)) {
      setStatusText(call.status === 'missed' ? 'Missed call' : call.status === 'rejected' ? 'Call declined' : 'Call ended');
      const timer = window.setTimeout(onClose, 1000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [call.status, onClose]);

  useEffect(() => () => stopMedia(), []);

  const accept = async () => {
    try {
      await ensurePeer();
      await onAccept(call.id);
      setAcceptedLocally(true);
      setStatusText('Connecting…');
    } catch (error) {
      setStatusText(error.message || 'Camera or microphone permission was denied.');
    }
  };
  const finish = async action => {
    stopMedia();
    await studioClient.chat.updateCall(call.id, { action }).catch(() => {});
    onClose();
  };
  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
    setMuted(next);
  };
  const toggleCamera = () => {
    const next = !cameraOff;
    localStreamRef.current?.getVideoTracks().forEach(track => { track.enabled = !next; });
    setCameraOff(next);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4" role="dialog" aria-modal="true" aria-label={`${call.kind} call`}>
      <section className="relative flex h-[min(42rem,92dvh)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-brass/20 bg-obsidian shadow-2xl">
        <video ref={remoteVideoRef} autoPlay playsInline className={`h-full w-full bg-black object-cover ${call.kind === 'voice' ? 'opacity-20' : ''}`} />
        {call.kind === 'video' && <video ref={localVideoRef} autoPlay muted playsInline className="absolute right-4 top-4 h-36 w-24 rounded-xl border border-white/20 bg-black object-cover shadow-xl sm:h-44 sm:w-32" />}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-black/80 via-transparent to-black/40 p-6 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brass/15 text-3xl font-semibold text-brass">{String(call.peer?.name || 'Call').slice(0, 1).toUpperCase()}</div>
          <h2 className="mt-4 font-display text-3xl text-ivory">{call.peer?.name || 'Studio call'}</h2>
          <p className="mt-2 text-sm text-ivory/55">{statusText}{!rtcConfig?.turnConfigured ? ' · direct connection' : ''}</p>
        </div>
        <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-4">
          {incoming && !acceptedLocally && call.status === 'ringing' ? (
            <>
              <button type="button" onClick={() => finish('rejected')} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white" aria-label="Decline call"><PhoneOff size={22} /></button>
              <button type="button" onClick={accept} className="flex h-14 min-w-14 items-center justify-center rounded-full bg-green-500 px-6 text-sm font-semibold text-white" aria-label="Accept call">Accept</button>
            </>
          ) : (
            <>
              <button type="button" onClick={toggleMute} className={`flex h-12 w-12 items-center justify-center rounded-full ${muted ? 'bg-white text-black' : 'bg-white/15 text-white'}`} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}>{muted ? <MicOff size={20} /> : <Mic size={20} />}</button>
              {call.kind === 'video' && <button type="button" onClick={toggleCamera} className={`flex h-12 w-12 items-center justify-center rounded-full ${cameraOff ? 'bg-white text-black' : 'bg-white/15 text-white'}`} aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}>{cameraOff ? <VideoOff size={20} /> : <Video size={20} />}</button>}
              <button type="button" onClick={() => finish('ended')} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white" aria-label="End call"><PhoneOff size={22} /></button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
