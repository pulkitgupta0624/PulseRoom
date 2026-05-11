import { useEffect, useMemo, useRef, useState } from 'react';
import Peer from 'simple-peer/simplepeer.min.js';
import { api } from '../lib/api';
import { formatDate } from '../lib/formatters';

const RECORDING_CHUNK_MS = 4000;

const stopMediaStream = (stream) => {
  if (!stream) {
    return;
  }

  stream.getTracks().forEach((track) => track.stop());
};

const pickSupportedRecordingMimeType = () => {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
    return '';
  }

  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];

  return candidates.find((candidate) => window.MediaRecorder.isTypeSupported(candidate)) || '';
};

const toEditableClip = (clip) => ({
  clipId: clip.clipId,
  title: clip.title,
  startOffsetSeconds: String(clip.startOffsetSeconds ?? 0),
  endOffsetSeconds: String(clip.endOffsetSeconds ?? 0)
});

const buildEditorState = (payload) => ({
  trimStart: String(payload?.trim?.startOffsetSeconds ?? 0),
  trimEnd:
    payload?.trim?.endOffsetSeconds !== null && payload?.trim?.endOffsetSeconds !== undefined
      ? String(payload.trim.endOffsetSeconds)
      : '',
  clips: (payload?.clips || []).map(toEditableClip)
});

const getReplayOptions = (payload) => [
  {
    id: 'full-replay',
    label: 'Full replay',
    url: payload?.playbackUrl || ''
  },
  ...((payload?.clips || []).map((clip) => ({
    id: clip.clipId,
    label: clip.title,
    url: clip.playbackUrl
  })))
].filter((option) => option.url);

const LiveStreamStage = ({
  eventId,
  socket,
  canBroadcast,
  canManage = false,
  event = null
}) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [recordingState, setRecordingState] = useState({
    state: 'idle',
    uploadedChunks: 0,
    warning: null
  });
  const [replayData, setReplayData] = useState(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayMessage, setReplayMessage] = useState(null);
  const [selectedReplayId, setSelectedReplayId] = useState('full-replay');
  const [editorState, setEditorState] = useState(() => buildEditorState(null));
  const [editorSaving, setEditorSaving] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const viewerPeerRef = useRef(null);
  const broadcasterPeersRef = useRef(new Map());
  const mediaRecorderRef = useRef(null);
  const recordingSessionIdRef = useRef('');
  const recordingUploadChainRef = useRef(Promise.resolve());
  const recordingFinalizePromiseRef = useRef(Promise.resolve());
  const recordingChunkCountRef = useRef(0);
  const recordingStartedAtRef = useRef(0);
  const recordingFailureRef = useRef(null);
  const recordingAbortRequestedRef = useRef(false);

  const replayOptions = useMemo(() => getReplayOptions(replayData), [replayData]);
  const activeReplayUrl =
    replayOptions.find((option) => option.id === selectedReplayId)?.url ||
    replayOptions[0]?.url ||
    '';
  const eventHasEnded = Boolean(
    event &&
      (event.status === 'completed' || new Date(event.endsAt || 0).getTime() <= Date.now())
  );

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

  const syncReplayState = (payload) => {
    setReplayData(payload);
    setEditorState(buildEditorState(payload));
    setSelectedReplayId((current) => {
      const nextOptions = getReplayOptions(payload);
      return nextOptions.some((option) => option.id === current)
        ? current
        : nextOptions[0]?.id || 'full-replay';
    });
  };

  const loadReplay = async ({ showError = false } = {}) => {
    if (!eventHasEnded && !(session?.recording?.replayReady && canManage)) {
      return;
    }

    setReplayLoading(true);
    try {
      const response = await api.get(`/api/live/${eventId}/replay`);
      syncReplayState(response.data.data);
      if (showError) {
        setReplayMessage(null);
      }
    } catch (loadError) {
      if (showError) {
        setReplayMessage({
          tone: 'error',
          text: loadError.response?.data?.message || 'Replay is not ready yet.'
        });
      }
    } finally {
      setReplayLoading(false);
    }
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
    if (!eventHasEnded && !session?.recording?.replayReady) {
      return;
    }

    void loadReplay();
  }, [eventHasEnded, eventId, session?.recording?.replayReady]);

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

    const handleReplayReady = ({ eventId: nextEventId, durationSeconds, clipsCount }) => {
      if (nextEventId !== eventId) {
        return;
      }

      setSession((current) => ({
        ...(current || {}),
        recording: {
          ...(current?.recording || {}),
          replayReady: true,
          durationSeconds:
            durationSeconds ?? current?.recording?.durationSeconds ?? 0,
          clipCount: clipsCount ?? current?.recording?.clipCount ?? 0
        }
      }));
      void loadReplay();
    };

    const handleStreamError = ({ message }) => {
      setError(message);
    };

    socket.on('stream:status', handleStatus);
    socket.on('stream:new-viewer', handleNewViewer);
    socket.on('stream:signal', handleSignal);
    socket.on('stream:ended', handleEnded);
    socket.on('stream:viewer-left', handleViewerLeft);
    socket.on('stream:replay-ready', handleReplayReady);
    socket.on('stream:error', handleStreamError);

    return () => {
      socket.off('stream:status', handleStatus);
      socket.off('stream:new-viewer', handleNewViewer);
      socket.off('stream:signal', handleSignal);
      socket.off('stream:ended', handleEnded);
      socket.off('stream:viewer-left', handleViewerLeft);
      socket.off('stream:replay-ready', handleReplayReady);
      socket.off('stream:error', handleStreamError);
    };
  }, [eventId, socket, canManage, eventHasEnded]);

  useEffect(() => {
    return () => {
      if (socket && localStreamRef.current) {
        socket.emit('stream:stop-broadcast', { eventId });
      }
      if (socket && viewerPeerRef.current) {
        socket.emit('stream:leave-viewer', { eventId });
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        recordingAbortRequestedRef.current = true;
        mediaRecorderRef.current.stop();
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

  const queueRecordingChunkUpload = (chunk) => {
    const recordingSessionId = recordingSessionIdRef.current;
    if (!recordingSessionId || !chunk || chunk.size <= 0 || recordingFailureRef.current) {
      return;
    }

    recordingChunkCountRef.current += 1;
    const chunkIndex = recordingChunkCountRef.current;
    recordingUploadChainRef.current = recordingUploadChainRef.current
      .catch(() => undefined)
      .then(async () => {
        if (recordingFailureRef.current) {
          return;
        }

        const formData = new FormData();
        formData.append('recordingSessionId', recordingSessionId);
        formData.append('chunk', chunk, `replay-${chunkIndex}.webm`);
        const response = await api.post(`/api/live/${eventId}/recordings/chunk`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });

        setRecordingState({
          state: 'uploading',
          uploadedChunks: response.data.data.uploadedChunks || chunkIndex,
          warning: null
        });
      })
      .catch((uploadError) => {
        recordingFailureRef.current = uploadError;
        setRecordingState((current) => ({
          ...current,
          state: 'failed',
          warning:
            uploadError.response?.data?.message ||
            'Replay upload failed. The live broadcast kept running, but this replay could not be saved.'
        }));
      });
  };

  const finalizeRecording = async ({ aborted = false } = {}) => {
    const recordingSessionId = recordingSessionIdRef.current;
    if (!recordingSessionId) {
      return;
    }

    try {
      await recordingUploadChainRef.current.catch(() => undefined);

      if (aborted || recordingFailureRef.current) {
        await api.post(`/api/live/${eventId}/recordings/abort`, {
          recordingSessionId
        });
        return;
      }

      const durationSeconds = recordingStartedAtRef.current
        ? Math.max(0, (Date.now() - recordingStartedAtRef.current) / 1000)
        : undefined;
      const response = await api.post(`/api/live/${eventId}/recordings/finalize`, {
        recordingSessionId,
        durationSeconds
      });

      syncReplayState(response.data.data);
      setRecordingState({
        state: 'ready',
        uploadedChunks: response.data.data.recording?.uploadedChunks || 0,
        warning: null
      });
    } catch (finalizeError) {
      setRecordingState((current) => ({
        ...current,
        state: 'failed',
        warning:
          finalizeError.response?.data?.message ||
          'PulseRoom could not finalize this replay. The stream still ended normally.'
      }));
    } finally {
      mediaRecorderRef.current = null;
      recordingSessionIdRef.current = '';
      recordingStartedAtRef.current = 0;
      recordingChunkCountRef.current = 0;
      recordingFailureRef.current = null;
      recordingAbortRequestedRef.current = false;
      recordingUploadChainRef.current = Promise.resolve();
    }
  };

  const stopLocalRecording = async ({ aborted = false } = {}) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      if (aborted && recordingSessionIdRef.current) {
        await finalizeRecording({ aborted: true });
      }
      return;
    }

    recordingAbortRequestedRef.current = aborted;

    if (recorder.state === 'inactive') {
      await recordingFinalizePromiseRef.current;
      return;
    }

    const stopPromise = new Promise((resolve) => {
      recorder.addEventListener('stop', resolve, { once: true });
    });
    recorder.stop();
    await stopPromise;
    await recordingFinalizePromiseRef.current;
  };

  const startLocalRecording = async (stream) => {
    if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
      setRecordingState({
        state: 'unsupported',
        uploadedChunks: 0,
        warning: 'This browser can broadcast live video, but it does not support automatic replay recording.'
      });
      return;
    }

    const mimeType = pickSupportedRecordingMimeType();

    try {
      const response = await api.post(`/api/live/${eventId}/recordings/start`, {
        mimeType
      });

      recordingSessionIdRef.current = response.data.data.recordingSessionId;
      recordingUploadChainRef.current = Promise.resolve();
      recordingFinalizePromiseRef.current = Promise.resolve();
      recordingChunkCountRef.current = 0;
      recordingStartedAtRef.current = Date.now();
      recordingFailureRef.current = null;
      recordingAbortRequestedRef.current = false;

      const recorder = mimeType
        ? new window.MediaRecorder(stream, { mimeType })
        : new window.MediaRecorder(stream);

      recorder.ondataavailable = (mediaEvent) => {
        if (mediaEvent.data && mediaEvent.data.size > 0) {
          queueRecordingChunkUpload(mediaEvent.data);
        }
      };
      recorder.onerror = (mediaEvent) => {
        recordingFailureRef.current = mediaEvent.error || new Error('Recording error');
        setRecordingState((current) => ({
          ...current,
          state: 'failed',
          warning: 'PulseRoom lost the replay recorder for this broadcast.'
        }));
      };
      recorder.onstop = () => {
        recordingFinalizePromiseRef.current = finalizeRecording({
          aborted: recordingAbortRequestedRef.current
        });
      };

      recorder.start(RECORDING_CHUNK_MS);
      mediaRecorderRef.current = recorder;
      setRecordingState({
        state: 'uploading',
        uploadedChunks: 0,
        warning: null
      });
    } catch (recordingError) {
      setRecordingState({
        state: 'failed',
        uploadedChunks: 0,
        warning:
          recordingError.response?.data?.message ||
          'The live broadcast started, but PulseRoom could not begin saving the replay.'
      });
    }
  };

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

      await startLocalRecording(stream);
      socket.emit('stream:start-broadcast', { eventId });
    } catch {
      setError('Camera or microphone access was denied.');
    } finally {
      setBusy(false);
    }
  };

  const stopBroadcast = async () => {
    if (!socket) {
      return;
    }

    socket.emit('stream:stop-broadcast', { eventId });
    destroyBroadcasterPeers();
    await stopLocalRecording();
    stopMediaStream(localStreamRef.current);
    localStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  };

  const saveReplayEdits = async () => {
    setEditorSaving(true);
    setReplayMessage(null);
    try {
      const payload = {
        trim: {
          startOffsetSeconds: Number(editorState.trimStart || 0),
          endOffsetSeconds:
            editorState.trimEnd === '' ? null : Number(editorState.trimEnd)
        },
        clips: editorState.clips.map((clip) => ({
          clipId: clip.clipId,
          title: clip.title,
          startOffsetSeconds: Number(clip.startOffsetSeconds || 0),
          endOffsetSeconds: Number(clip.endOffsetSeconds || 0)
        }))
      };
      const response = await api.patch(`/api/live/${eventId}/replay/editor`, payload);
      syncReplayState(response.data.data);
      setReplayMessage({
        tone: 'success',
        text: 'Replay trims and clips are live for attendees now.'
      });
    } catch (saveError) {
      setReplayMessage({
        tone: 'error',
        text: saveError.response?.data?.message || 'Replay edits could not be saved.'
      });
    } finally {
      setEditorSaving(false);
    }
  };

  const isBroadcasting = Boolean(localStreamRef.current);
  const shouldShowReplay = !isBroadcasting && !hasRemoteStream && replayData?.replayAvailable;
  const waitingForOrganizer =
    !isBroadcasting && !hasRemoteStream && !shouldShowReplay && session?.status !== 'live';

  return (
    <section className="space-y-4 rounded-[32px] border border-ink/10 bg-white/80 p-5 shadow-bloom">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-reef">
            {shouldShowReplay ? 'Event Replay' : 'Live Stream'}
          </p>
          <h2 className="mt-1 font-display text-3xl text-ink">
            {shouldShowReplay ? 'Replay the room' : 'Inside the room broadcast'}
          </h2>
          <p className="mt-2 text-sm text-ink/60">
            {shouldShowReplay
              ? 'Confirmed attendees can jump back into the finished session, and organizers can shape the replay timeline.'
              : 'Organizer camera goes out over peer-to-peer WebRTC right inside PulseRoom.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
              session?.status === 'live'
                ? 'bg-reef/10 text-reef'
                : shouldShowReplay
                  ? 'bg-dusk/10 text-dusk'
                  : 'bg-ink/8 text-ink/50'
            }`}
          >
            {session?.status === 'live'
              ? 'Live now'
              : shouldShowReplay
                ? 'Replay ready'
                : loading
                  ? 'Loading'
                  : 'Standby'}
          </span>
          <span className="rounded-full border border-ink/10 px-3 py-1 text-xs text-ink/55">
            {session?.viewerCount || 0} viewers
          </span>
          {recordingState.state === 'uploading' && (
            <span className="rounded-full border border-dusk/20 bg-dusk/5 px-3 py-1 text-xs font-semibold text-dusk">
              Recording replay
            </span>
          )}
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
        ) : shouldShowReplay ? (
          <video
            key={activeReplayUrl}
            className="aspect-video w-full object-cover"
            src={activeReplayUrl}
            controls
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

      {shouldShowReplay && replayOptions.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {replayOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedReplayId(option.id)}
                className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                  selectedReplayId === option.id
                    ? 'bg-ink text-sand'
                    : 'border border-ink/10 bg-sand text-ink/60 hover:bg-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink/45">
            Replay length {Math.round(replayData?.recording?.durationSeconds || 0)}s
          </p>
        </div>
      )}

      {session?.startedAt && session.status === 'live' && (
        <p className="text-xs text-ink/45">Broadcast started {formatDate(session.startedAt)}</p>
      )}

      {recordingState.state === 'uploading' && (
        <p className="rounded-2xl bg-dusk/10 px-4 py-3 text-sm text-dusk">
          Auto-recording in progress. {recordingState.uploadedChunks} chunk
          {recordingState.uploadedChunks === 1 ? '' : 's'} have already been saved for replay.
        </p>
      )}

      {recordingState.warning && (
        <p className="rounded-2xl bg-amber-100 px-4 py-3 text-sm text-amber-700">
          {recordingState.warning}
        </p>
      )}

      {error && (
        <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
      )}

      {replayMessage && (
        <p
          className={`rounded-2xl px-4 py-3 text-sm ${
            replayMessage.tone === 'success'
              ? 'bg-reef/10 text-reef'
              : 'bg-ember/10 text-ember'
          }`}
        >
          {replayMessage.text}
        </p>
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
              onClick={() => void stopBroadcast()}
              className="rounded-full border border-ember/25 bg-ember/5 px-5 py-3 text-sm font-semibold text-ember"
            >
              End broadcast
            </button>
          )}
        </div>
      )}

      {replayLoading && (
        <p className="text-xs text-ink/45">Loading the latest replay version...</p>
      )}

      {canManage && shouldShowReplay && replayData?.canEdit && (
        <div className="space-y-4 rounded-[28px] border border-ink/10 bg-sand/60 p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-dusk">Post-event editing</p>
            <h3 className="mt-1 font-display text-2xl text-ink">Trim the replay and cut highlights</h3>
            <p className="mt-2 text-sm text-ink/60">
              These edits update the attendee replay instantly without touching the original recording.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm text-ink/65">
              <span className="text-xs uppercase tracking-[0.18em] text-ink/45">Trim start (seconds)</span>
              <input
                type="number"
                min="0"
                value={editorState.trimStart}
                onChange={(eventInput) =>
                  setEditorState((current) => ({
                    ...current,
                    trimStart: eventInput.target.value
                  }))
                }
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none focus:border-dusk"
              />
            </label>
            <label className="space-y-1 text-sm text-ink/65">
              <span className="text-xs uppercase tracking-[0.18em] text-ink/45">
                Trim end (seconds, optional)
              </span>
              <input
                type="number"
                min="0"
                value={editorState.trimEnd}
                onChange={(eventInput) =>
                  setEditorState((current) => ({
                    ...current,
                    trimEnd: eventInput.target.value
                  }))
                }
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none focus:border-dusk"
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Replay clips</p>
              <button
                type="button"
                onClick={() =>
                  setEditorState((current) => ({
                    ...current,
                    clips: [
                      ...current.clips,
                      {
                        clipId: `draft-${Date.now()}`,
                        title: `Highlight ${current.clips.length + 1}`,
                        startOffsetSeconds: current.trimStart || '0',
                        endOffsetSeconds:
                          current.trimEnd ||
                          String(Math.round(replayData?.recording?.durationSeconds || 0))
                      }
                    ]
                  }))
                }
                className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink/65 hover:bg-sand"
              >
                Add clip
              </button>
            </div>

            {editorState.clips.length === 0 && (
              <p className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-ink/55">
                No highlights yet. Add clips to spotlight key moments for attendees.
              </p>
            )}

            {editorState.clips.map((clip, index) => (
              <div key={clip.clipId} className="grid gap-3 rounded-2xl border border-ink/10 bg-white/80 p-4 md:grid-cols-[1.2fr,0.8fr,0.8fr,auto]">
                <input
                  value={clip.title}
                  onChange={(eventInput) =>
                    setEditorState((current) => ({
                      ...current,
                      clips: current.clips.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, title: eventInput.target.value }
                          : item
                      )
                    }))
                  }
                  placeholder="Clip title"
                  className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-dusk"
                />
                <input
                  type="number"
                  min="0"
                  value={clip.startOffsetSeconds}
                  onChange={(eventInput) =>
                    setEditorState((current) => ({
                      ...current,
                      clips: current.clips.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, startOffsetSeconds: eventInput.target.value }
                          : item
                      )
                    }))
                  }
                  placeholder="Start"
                  className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-dusk"
                />
                <input
                  type="number"
                  min="0"
                  value={clip.endOffsetSeconds}
                  onChange={(eventInput) =>
                    setEditorState((current) => ({
                      ...current,
                      clips: current.clips.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, endOffsetSeconds: eventInput.target.value }
                          : item
                      )
                    }))
                  }
                  placeholder="End"
                  className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-dusk"
                />
                <button
                  type="button"
                  onClick={() =>
                    setEditorState((current) => ({
                      ...current,
                      clips: current.clips.filter((item, itemIndex) => itemIndex !== index)
                    }))
                  }
                  className="rounded-2xl border border-ember/20 bg-ember/5 px-4 py-3 text-sm font-semibold text-ember"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void saveReplayEdits()}
              disabled={editorSaving}
              className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-sand disabled:opacity-60"
            >
              {editorSaving ? 'Saving replay...' : 'Save replay edits'}
            </button>
            <button
              type="button"
              onClick={() => setEditorState(buildEditorState(replayData))}
              className="rounded-full border border-ink/10 bg-white px-5 py-3 text-sm font-semibold text-ink/65"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default LiveStreamStage;
