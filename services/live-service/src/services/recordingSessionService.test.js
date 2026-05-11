jest.mock('../models/StreamSession', () => {
  const StreamSession = jest.fn(function MockStreamSession(data) {
    Object.assign(this, data);
    this.save = jest.fn().mockResolvedValue(this);
  });

  StreamSession.findOne = jest.fn();

  return StreamSession;
});

const StreamSession = require('../models/StreamSession');
const { markRecordingFailed } = require('./recordingSessionService');

const buildSession = (recording) => ({
  recordingUrl: 'https://cdn.example/replay.webm',
  recording: {
    toObject: () => recording
  },
  save: jest.fn().mockResolvedValue(true)
});

describe('recordingSessionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('marks the current recording session as failed', async () => {
    const session = buildSession({
      sessionId: 'session-1',
      status: 'uploading',
      mimeType: 'video/webm',
      uploadedChunks: 4
    });
    StreamSession.findOne.mockResolvedValue(session);

    const updated = await markRecordingFailed({
      eventId: 'event-1',
      recordingSessionId: 'session-1',
      errorMessage: 'recording_aborted_by_client'
    });

    expect(updated).toBe(true);
    expect(session.recordingUrl).toBeUndefined();
    expect(session.recording).toEqual(
      expect.objectContaining({
        sessionId: 'session-1',
        status: 'failed',
        mimeType: 'video/webm',
        uploadedChunks: 4,
        playbackUrl: '',
        originalUrl: '',
        readyAt: null,
        error: 'recording_aborted_by_client'
      })
    );
    expect(session.save).toHaveBeenCalled();
  });

  test('ignores failure updates for stale recording session ids', async () => {
    const session = buildSession({
      sessionId: 'session-2',
      status: 'uploading',
      mimeType: 'video/mp4'
    });
    StreamSession.findOne.mockResolvedValue(session);

    const updated = await markRecordingFailed({
      eventId: 'event-2',
      recordingSessionId: 'session-1',
      errorMessage: 'recording_restarted'
    });

    expect(updated).toBe(false);
    expect(session.save).not.toHaveBeenCalled();
    expect(session.recording.toObject()).toEqual(
      expect.objectContaining({
        sessionId: 'session-2',
        status: 'uploading'
      })
    );
  });

  test('does not overwrite a replay that is already ready', async () => {
    const session = buildSession({
      sessionId: 'session-1',
      status: 'ready',
      mimeType: 'video/webm',
      playbackUrl: 'https://cdn.example/replay.webm'
    });
    StreamSession.findOne.mockResolvedValue(session);

    const updated = await markRecordingFailed({
      eventId: 'event-3',
      recordingSessionId: 'session-1',
      errorMessage: 'recording_aborted_by_client'
    });

    expect(updated).toBe(false);
    expect(session.save).not.toHaveBeenCalled();
    expect(session.recording.toObject()).toEqual(
      expect.objectContaining({
        sessionId: 'session-1',
        status: 'ready',
        playbackUrl: 'https://cdn.example/replay.webm'
      })
    );
  });
});
