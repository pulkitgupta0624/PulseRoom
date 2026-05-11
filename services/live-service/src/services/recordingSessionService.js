const StreamSession = require('../models/StreamSession');

const toPlainObject = (value) =>
  typeof value?.toObject === 'function' ? value.toObject() : { ...(value || {}) };

const loadOrCreateStreamSession = async (eventId) => {
  const existingSession = await StreamSession.findOne({ eventId });
  if (existingSession) {
    return existingSession;
  }

  return new StreamSession({
    eventId,
    broadcasterId: 'system',
    status: 'idle'
  });
};

const markRecordingFailed = async ({
  eventId,
  recordingSessionId,
  mimeType,
  errorMessage
}) => {
  const streamSession = await loadOrCreateStreamSession(eventId);
  const currentRecording = toPlainObject(streamSession.recording);
  const currentSessionId = String(currentRecording.sessionId || '').trim();
  const targetSessionId = String(recordingSessionId || '').trim();

  if (targetSessionId && currentSessionId && currentSessionId !== targetSessionId) {
    return false;
  }

  if (currentRecording.status === 'ready') {
    return false;
  }

  streamSession.recordingUrl = undefined;
  streamSession.recording = {
    ...currentRecording,
    sessionId: targetSessionId || currentSessionId || '',
    status: 'failed',
    mimeType: mimeType || currentRecording.mimeType || '',
    playbackUrl: '',
    originalUrl: '',
    readyAt: null,
    error: errorMessage,
    failedAt: new Date()
  };
  await streamSession.save();

  return true;
};

module.exports = {
  loadOrCreateStreamSession,
  markRecordingFailed,
  toPlainObject
};
