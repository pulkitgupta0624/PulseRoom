const {
  buildReplayClip,
  buildReplayPlaybackUrl,
  buildReplayResponse,
  normalizeTrimWindow
} = require('./replayService');

describe('replayService', () => {
  const cloudinary = {
    url: jest.fn((_publicId, options) => JSON.stringify(options))
  };

  beforeEach(() => {
    cloudinary.url.mockClear();
  });

  test('normalizeTrimWindow clamps start and end to the recording duration', () => {
    expect(
      normalizeTrimWindow({
        startOffsetSeconds: 14,
        endOffsetSeconds: 120,
        durationSeconds: 90
      })
    ).toEqual({
      startOffsetSeconds: 14,
      endOffsetSeconds: 90,
      durationSeconds: 76
    });
  });

  test('buildReplayPlaybackUrl forwards clip offsets to Cloudinary video delivery', () => {
    const url = buildReplayPlaybackUrl({
      cloudinary,
      publicId: 'pulseroom/replays/event/asset',
      format: 'webm',
      startOffsetSeconds: 12,
      endOffsetSeconds: 42
    });

    expect(url).toContain('"resource_type":"video"');
    expect(url).toContain('"format":"webm"');
    expect(url).toContain('"start_offset":12');
    expect(url).toContain('"end_offset":42');
  });

  test('buildReplayClip creates a replay highlight with a playback url', () => {
    const clip = buildReplayClip({
      cloudinary,
      publicId: 'pulseroom/replays/event/asset',
      format: 'webm',
      durationSeconds: 180,
      createdBy: 'organizer-1',
      clip: {
        title: 'Q&A highlight',
        startOffsetSeconds: 40,
        endOffsetSeconds: 64
      }
    });

    expect(clip.title).toBe('Q&A highlight');
    expect(clip.durationSeconds).toBe(24);
    expect(clip.playbackUrl).toContain('"start_offset":40');
    expect(clip.playbackUrl).toContain('"end_offset":64');
  });

  test('buildReplayResponse keeps attendee payloads trimmed and replay-ready', () => {
    const payload = buildReplayResponse({
      cloudinary,
      canEdit: false,
      session: {
        eventId: 'event-123',
        recording: {
          status: 'ready',
          publicId: 'pulseroom/replays/event/asset',
          format: 'webm',
          playbackUrl: 'https://cdn.example/replay.webm',
          originalUrl: 'https://cdn.example/raw.webm',
          durationSeconds: 120,
          trim: {
            startOffsetSeconds: 5,
            endOffsetSeconds: 95
          },
          clips: [
            {
              clipId: 'clip-1',
              title: 'Intro',
              startOffsetSeconds: 5,
              endOffsetSeconds: 25,
              durationSeconds: 20,
              playbackUrl: 'https://cdn.example/clip-1.webm'
            }
          ]
        }
      }
    });

    expect(payload.replayAvailable).toBe(true);
    expect(payload.canEdit).toBe(false);
    expect(payload.recording.publicId).toBeNull();
    expect(payload.recording.originalUrl).toBeNull();
    expect(payload.clips).toHaveLength(1);
  });
});
