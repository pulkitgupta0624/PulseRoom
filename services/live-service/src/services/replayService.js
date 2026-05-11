const crypto = require('crypto');

const roundSeconds = (value) => Number(Math.max(0, Number(value || 0)).toFixed(2));

const normalizeTrimWindow = ({
  startOffsetSeconds = 0,
  endOffsetSeconds,
  durationSeconds = 0
} = {}) => {
  const safeDuration = roundSeconds(durationSeconds);
  const maxOffset = safeDuration > 0 ? safeDuration : Number.MAX_SAFE_INTEGER;
  const safeStart = Math.min(roundSeconds(startOffsetSeconds), maxOffset);
  const hasEnd = Number.isFinite(Number(endOffsetSeconds));
  const safeEnd = hasEnd
    ? Math.min(Math.max(roundSeconds(endOffsetSeconds), safeStart), maxOffset)
    : null;
  const computedDuration = safeEnd !== null
    ? roundSeconds(safeEnd - safeStart)
    : safeDuration > 0
      ? roundSeconds(safeDuration - safeStart)
      : 0;

  return {
    startOffsetSeconds: safeStart,
    endOffsetSeconds: safeEnd,
    durationSeconds: computedDuration
  };
};

const buildReplayPlaybackUrl = ({
  cloudinary,
  publicId,
  format,
  startOffsetSeconds = 0,
  endOffsetSeconds = null
}) => {
  if (!cloudinary || !publicId) {
    return '';
  }

  const options = {
    resource_type: 'video',
    secure: true
  };

  if (format) {
    options.format = format;
  }

  if (startOffsetSeconds > 0 || endOffsetSeconds !== null) {
    options.transformation = [
      {
        ...(startOffsetSeconds > 0 ? { start_offset: startOffsetSeconds } : {}),
        ...(endOffsetSeconds !== null ? { end_offset: endOffsetSeconds } : {})
      }
    ];
  }

  return cloudinary.url(publicId, options);
};

const buildReplayClip = ({
  cloudinary,
  publicId,
  format,
  clip,
  durationSeconds,
  createdBy
}) => {
  const normalizedWindow = normalizeTrimWindow({
    startOffsetSeconds: clip.startOffsetSeconds,
    endOffsetSeconds: clip.endOffsetSeconds,
    durationSeconds
  });
  const now = new Date();

  return {
    clipId: clip.clipId || crypto.randomUUID(),
    title: String(clip.title || 'New clip').trim().slice(0, 80) || 'New clip',
    startOffsetSeconds: normalizedWindow.startOffsetSeconds,
    endOffsetSeconds:
      normalizedWindow.endOffsetSeconds ?? normalizedWindow.startOffsetSeconds,
    durationSeconds: normalizedWindow.durationSeconds,
    playbackUrl: buildReplayPlaybackUrl({
      cloudinary,
      publicId,
      format,
      startOffsetSeconds: normalizedWindow.startOffsetSeconds,
      endOffsetSeconds: normalizedWindow.endOffsetSeconds
    }),
    createdBy: clip.createdBy || createdBy || '',
    createdAt: clip.createdAt || now,
    updatedAt: now
  };
};

const buildReplayResponse = ({
  cloudinary,
  session,
  canEdit = false
}) => {
  const rawSession = typeof session?.toObject === 'function' ? session.toObject() : { ...(session || {}) };
  const recording = rawSession.recording || {};
  const durationSeconds = roundSeconds(recording.durationSeconds || 0);
  const trim = normalizeTrimWindow({
    startOffsetSeconds: recording.trim?.startOffsetSeconds,
    endOffsetSeconds: recording.trim?.endOffsetSeconds,
    durationSeconds
  });
  const playbackUrl = recording.playbackUrl || buildReplayPlaybackUrl({
    cloudinary,
    publicId: recording.publicId,
    format: recording.format,
    startOffsetSeconds: trim.startOffsetSeconds,
    endOffsetSeconds: trim.endOffsetSeconds
  });

  return {
    eventId: rawSession.eventId,
    replayAvailable: recording.status === 'ready' && Boolean(playbackUrl),
    canEdit,
    playbackUrl,
    trim,
    recording: {
      status: recording.status || 'idle',
      provider: recording.provider || 'cloudinary',
      publicId: canEdit ? recording.publicId || null : null,
      originalUrl: canEdit ? recording.originalUrl || null : null,
      playbackUrl,
      format: recording.format || null,
      mimeType: recording.mimeType || null,
      durationSeconds,
      bytes: Number(recording.bytes || 0),
      uploadedChunks: Number(recording.uploadedChunks || 0),
      startedAt: recording.startedAt || null,
      readyAt: recording.readyAt || null,
      failedAt: recording.failedAt || null,
      error: canEdit ? recording.error || null : null
    },
    clips: (recording.clips || []).map((clip) => ({
      clipId: clip.clipId,
      title: clip.title,
      startOffsetSeconds: roundSeconds(clip.startOffsetSeconds),
      endOffsetSeconds: roundSeconds(clip.endOffsetSeconds),
      durationSeconds: roundSeconds(clip.durationSeconds),
      playbackUrl: clip.playbackUrl,
      createdAt: clip.createdAt || null,
      updatedAt: clip.updatedAt || null
    }))
  };
};

const buildStreamSessionResponse = (session) => {
  const rawSession = typeof session?.toObject === 'function' ? session.toObject() : { ...(session || {}) };
  const recording = rawSession.recording || {};

  return {
    ...rawSession,
    recordingUrl: undefined,
    recording: {
      status: recording.status || 'idle',
      durationSeconds: Number(recording.durationSeconds || 0),
      uploadedChunks: Number(recording.uploadedChunks || 0),
      readyAt: recording.readyAt || null,
      startedAt: recording.startedAt || null,
      trim: {
        startOffsetSeconds: roundSeconds(recording.trim?.startOffsetSeconds),
        endOffsetSeconds:
          recording.trim?.endOffsetSeconds !== undefined && recording.trim?.endOffsetSeconds !== null
            ? roundSeconds(recording.trim.endOffsetSeconds)
            : null
      },
      clipCount: Array.isArray(recording.clips) ? recording.clips.length : 0,
      replayReady: recording.status === 'ready' && Boolean(recording.playbackUrl || rawSession.recordingUrl)
    }
  };
};

module.exports = {
  buildReplayClip,
  buildReplayPlaybackUrl,
  buildReplayResponse,
  buildStreamSessionResponse,
  normalizeTrimWindow
};
