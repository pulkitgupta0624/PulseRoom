import { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer/simplepeer.min.js';
import { api } from '../lib/api';
import { formatDate } from '../lib/formatters';

const stopMediaStream = (stream) => {
  if (!stream) {
    return;
  }

  stream.getTracks().forEach((track) => track.stop());
};

const LiveStreamStage = ({ eventId, socket, canBroadcast }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const viewerPeerRef = useRef(null);
  const broadcasterPeersRef = useRef(new Map());

  const destroyViewerPeer = () => {
    if (viewerPeerRef.current) {
      viewerPeerRef.current.destroy();
      viewerPeerRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setHasRemoteStream(false);
  };

  const destroyBroadcasterPeers = () => {
    broadcasterPeersRef.current.forEach((peer) => peer.destroy());
    broadcasterPeersRef.current.clear();
  };

  useEffect(() => {
    let active = true;

    const loadSession = async () => {
      try {
        const response = await api.get(`/api/live/${eventId}/stream-session`);
        if (active) {
          setSession(response.data.data);
        }
      } catch {
        if (active) {
          setSession({
            eventId,
            status: 'idle',
            viewerCount: 0
          });
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadSession();
    return () => {
      active = false;
    };
  }, [eventId]);

  useEffect(() => {
    if (!socket) {
      return undefined;
    }

    const createBroadcasterPeer = (viewerSocketId) => {
      if (!localStreamRef.current || broadcasterPeersRef.current.has(viewerSocketId)) {
        return broadcasterPeersRef.current.get(viewerSocketId);
      }

      const peer = new Peer({
        initiator: true,
        trickle: false,
        stream: localStreamRef.current
      });

      peer.on('signal', (signal) => {
        socket.emit('stream:signal', {
          eventId,
          targetSocketId: viewerSocketId,
          signal
        });
      });

      peer.on('error', () => {
        setError('One viewer connection dropped. The broadcast is still running.');
      });

      peer.on('close', () => {
        broadcasterPeersRef.current.delete(viewerSocketId);
      });

      broadcasterPeersRef.current.set(viewerSocketId, peer);
      return peer;
    };

    const createViewerPeer = (broadcasterSocketId) => {
      if (viewerPeerRef.current) {
        return viewerPeerRef.current;
      }

      const peer = new Peer({
        initiator: false,
        trickle: false
      });

      peer.on('signal', (signal) => {
        socket.emit('stream:signal', {
          eventId,
          targetSocketId: broadcasterSocketId,
          signal
        });
      });

      peer.on('stream', (remoteStream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
        setHasRemoteStream(true);
        setError(null);
      });

      peer.on('close', () => {
        destroyViewerPeer();
      });

      peer.on('error', () => {
        setError('Stream connection issue. Reconnecting to the organizer feed...');
        destroyViewerPeer();
      });

      viewerPeerRef.current = peer;
      return peer;
    };

    const handleStatus = (nextSession) => {
      if (nextSession.eventId !== eventId) {
        return;
      }

      setSession(nextSession);
      if (nextSession.status === 'live' && !localStreamRef.current) {
        socket.emit('stream:viewer-ready', { eventId });
      }
      if (nextSession.status !== 'live' && !localStreamRef.current) {
        destroyViewerPeer();
      }
    };

    const handleNewViewer = ({ eventId: nextEventId, viewerSocketId }) => {
      if (nextEventId !== eventId) {
        return;
      }

      createBroadcasterPeer(viewerSocketId);
    };

    const handleSignal = ({ eventId: nextEventId, senderSocketId, signal }) => {
      if (nextEventId !== eventId) {
        return;
      }

      if (localStreamRef.current) {
        const broadcasterPeer = broadcasterPeersRef.current.get(senderSocketId);
        broadcasterPeer?.signal(signal);
        return;
      }

      const viewerPeer = createViewerPeer(senderSocketId);
      viewerPeer.signal(signal);
    };

    const handleEnded = ({ eventId: nextEventId }) => {
      if (nextEventId !== eventId) {
        return;
      }

      setSession((current) => ({
        ...(current || {}),
        eventId,
        status: 'idle',
        viewerCount: 0,
        broadcasterId: null
      }));
      if (!localStreamRef.current) {
        destroyViewerPeer();
      }
    };

    const handleViewerLeft = ({ viewerSocketId }) => {
      const peer = broadcasterPeersRef.current.get(viewerSocketId);
      if (peer) {
        peer.destroy();
        broadcasterPeersRef.current.delete(viewerSocketId);
      }
    };

    const handleStreamError = ({ message }) => {
      setError(message);
    };

    socket.on('stream:status', handleStatus);
    socket.on('stream:new-viewer', handleNewViewer);
    socket.on('stream:signal', handleSignal);
    socket.on('stream:ended', handleEnded);
    socket.on('stream:viewer-left', handleViewerLeft);
    socket.on('stream:error', handleStreamError);

    return () => {
      socket.off('stream:status', handleStatus);
      socket.off('stream:new-viewer', handleNewViewer);
      socket.off('stream:signal', handleSignal);
      socket.off('stream:ended', handleEnded);
      socket.off('stream:viewer-left', handleViewerLeft);
      socket.off('stream:error', handleStreamError);
    };
  }, [eventId, socket]);

  useEffect(() => {
    return () => {
      if (socket && localStreamRef.current) {
        socket.emit('stream:stop-broadcast', { eventId });
      }
      if (socket && viewerPeerRef.current) {
        socket.emit('stream:leave-viewer', { eventId });
      }

      destroyBroadcasterPeers();
      destroyViewerPeer();
      stopMediaStream(localStreamRef.current);
      localStreamRef.current = null;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    };
  }, [eventId, socket]);

  const startBroadcast = async () => {
    if (!socket) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not support camera broadcasting.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      socket.emit('stream:start-broadcast', { eventId });
    } catch {
      setError('Camera or microphone access was denied.');
    } finally {
      setBusy(false);
    }
  };

  const stopBroadcast = () => {
    if (!socket) {
      return;
    }

    socket.emit('stream:stop-broadcast', { eventId });
    destroyBroadcasterPeers();
    stopMediaStream(localStreamRef.current);
    localStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  };

  const isBroadcasting = Boolean(localStreamRef.current);
  const waitingForOrganizer = !isBroadcasting && !hasRemoteStream && session?.status !== 'live';

  return (
    <section className="space-y-4 rounded-[32px] border border-ink/10 bg-white/80 p-5 shadow-bloom">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-reef">Live Stream</p>
          <h2 className="mt-1 font-display text-3xl text-ink">Inside the room broadcast</h2>
          <p className="mt-2 text-sm text-ink/60">
            Organizer camera goes out over peer-to-peer WebRTC right inside PulseRoom.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
              session?.status === 'live' ? 'bg-reef/10 text-reef' : 'bg-ink/8 text-ink/50'
            }`}
          >
            {session?.status === 'live' ? 'Live now' : loading ? 'Loading' : 'Standby'}
          </span>
          <span className="rounded-full border border-ink/10 px-3 py-1 text-xs text-ink/55">
            {session?.viewerCount || 0} viewers
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-ink">
        {isBroadcasting ? (
          <video
            ref={localVideoRef}
            className="aspect-video w-full object-cover"
            autoPlay
            muted
            playsInline
          />
        ) : hasRemoteStream ? (
          <video
            ref={remoteVideoRef}
            className="aspect-video w-full object-cover"
            autoPlay
            playsInline
          />
        ) : (
          <div className="flex aspect-video flex-col items-center justify-center gap-4 px-6 text-center text-sand">
            <div className="h-14 w-14 rounded-full border border-sand/15 bg-white/5" />
            <div>
              <p className="font-display text-3xl">
                {waitingForOrganizer ? 'Broadcast not started yet' : 'Connecting to the live stage'}
              </p>
              <p className="mt-2 text-sm text-sand/70">
                {waitingForOrganizer
                  ? 'Once the organizer starts their camera, the stream will appear here automatically.'
                  : 'PulseRoom is negotiating the peer connection right now.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {session?.startedAt && session.status === 'live' && (
        <p className="text-xs text-ink/45">Broadcast started {formatDate(session.startedAt)}</p>
      )}

      {error && (
        <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
      )}

      {canBroadcast && (
        <div className="flex flex-wrap gap-3">
          {!isBroadcasting ? (
            <button
              type="button"
              onClick={startBroadcast}
              disabled={busy}
              className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-sand disabled:opacity-60"
            >
              {busy ? 'Starting camera...' : 'Start broadcast'}
            </button>
          ) : (
            <button
              type="button"
              onClick={stopBroadcast}
              className="rounded-full border border-ember/25 bg-ember/5 px-5 py-3 text-sm font-semibold text-ember"
            >
              End broadcast
            </button>
          )}
        </div>
      )}
    </section>
  );
};

export default LiveStreamStage;
