const { EventEmitter } = require('events');

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_chunked_stream: jest.fn()
    }
  }
}));

const cloudinary = require('cloudinary').v2;
const { createRecordingUploadService } = require('./recordingUploadService');

class FakeUploadStream extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.write = jest.fn((_buffer, callback) => callback());
    this.end = jest.fn();
    this.destroy = jest.fn((error) => {
      this.destroyed = true;
      queueMicrotask(() => {
        this.emit('error', error);
      });
    });
  }
}

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('recordingUploadService', () => {
  const config = {
    cloudinaryCloudName: 'demo-cloud',
    cloudinaryApiKey: 'demo-key',
    cloudinaryApiSecret: 'demo-secret'
  };
  const logger = {
    warn: jest.fn(),
    error: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('aborting an upload reports the failure without crashing the process', async () => {
    const onUploadFailure = jest.fn().mockResolvedValue();
    const stream = new FakeUploadStream();
    cloudinary.uploader.upload_chunked_stream.mockReturnValue(stream);

    const service = createRecordingUploadService({
      config,
      logger,
      onUploadFailure
    });

    const { recordingSessionId } = service.startUpload({
      eventId: 'event-1',
      organizerId: 'org-1',
      mimeType: 'video/webm'
    });

    expect(
      service.abortUpload({
        recordingSessionId,
        reason: 'recording_aborted_by_client'
      })
    ).toBe(true);

    await flushPromises();

    expect(stream.destroy).toHaveBeenCalledWith(expect.any(Error));
    expect(onUploadFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'event-1',
        recordingSessionId,
        reason: 'recording_aborted_by_client'
      })
    );
  });

  test('idle uploads are aborted and reported after the timeout window', async () => {
    jest.useFakeTimers();

    const onUploadFailure = jest.fn().mockResolvedValue();
    const stream = new FakeUploadStream();
    cloudinary.uploader.upload_chunked_stream.mockReturnValue(stream);

    const service = createRecordingUploadService({
      config,
      logger,
      idleTimeoutMs: 50,
      onUploadFailure
    });

    service.startUpload({
      eventId: 'event-2',
      organizerId: 'org-2',
      mimeType: 'video/mp4'
    });

    jest.advanceTimersByTime(50);
    await flushPromises();

    expect(stream.destroy).toHaveBeenCalledWith(expect.any(Error));
    expect(onUploadFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'event-2',
        reason: 'recording_upload_timed_out'
      })
    );

  });

  test('chunk write failures destroy the stream and bubble the original error', async () => {
    const onUploadFailure = jest.fn().mockResolvedValue();
    const stream = new FakeUploadStream();
    const writeError = new Error('socket hang up');
    stream.write.mockImplementation((_buffer, callback) => callback(writeError));
    cloudinary.uploader.upload_chunked_stream.mockReturnValue(stream);

    const service = createRecordingUploadService({
      config,
      logger,
      onUploadFailure
    });

    const { recordingSessionId } = service.startUpload({
      eventId: 'event-3',
      organizerId: 'org-3',
      mimeType: 'video/webm'
    });

    await expect(
      service.appendChunk({
        recordingSessionId,
        buffer: Buffer.from('chunk')
      })
    ).rejects.toThrow('socket hang up');

    await flushPromises();

    expect(stream.destroy).toHaveBeenCalledWith(writeError);
    expect(onUploadFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'event-3',
        reason: 'socket hang up'
      })
    );
  });
});
