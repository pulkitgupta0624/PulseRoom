const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const { AppError } = require('@pulseroom/common');

const DEFAULT_IDLE_TIMEOUT_MS = 90 * 1000;

const createRecordingUploadService = ({
  config,
  logger,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  onUploadFailure
}) => {
  cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret,
    timeout: 120_000
  });

  const activeUploads = new Map();
  const activeUploadByEventId = new Map();

  const normalizeError = (error, fallbackMessage = 'recording_upload_failed') => {
    if (error instanceof Error) {
      return error;
    }

    return new Error(typeof error === 'string' && error ? error : fallbackMessage);
  };

  const assertConfigured = () => {
    if (config.cloudinaryCloudName && config.cloudinaryApiKey && config.cloudinaryApiSecret) {
      return;
    }

    throw new AppError(
      'Cloudinary recording storage is not configured for live replay uploads.',
      503,
      'recording_storage_not_configured'
    );
  };

  const clearIdleTimer = (activeUpload) => {
    if (activeUpload?.idleTimer) {
      clearTimeout(activeUpload.idleTimer);
      activeUpload.idleTimer = null;
    }
  };

  const removeActiveUpload = (recordingSessionId) => {
    const activeUpload = activeUploads.get(recordingSessionId);
    if (!activeUpload) {
      return null;
    }

    clearIdleTimer(activeUpload);
    activeUploads.delete(recordingSessionId);
    if (activeUploadByEventId.get(activeUpload.eventId) === recordingSessionId) {
      activeUploadByEventId.delete(activeUpload.eventId);
    }
    return activeUpload;
  };

  const notifyUploadFailure = (activeUpload, error) => {
    if (typeof onUploadFailure !== 'function' || activeUpload.failureNotified) {
      return;
    }

    activeUpload.failureNotified = true;

    Promise.resolve()
      .then(() =>
        onUploadFailure({
          eventId: activeUpload.eventId,
          organizerId: activeUpload.organizerId,
          recordingSessionId: activeUpload.recordingSessionId,
          mimeType: activeUpload.mimeType,
          publicId: activeUpload.publicId,
          uploadedChunks: activeUpload.uploadedChunks,
          bytes: activeUpload.bytes,
          reason: activeUpload.abortReason || error.message || 'recording_upload_failed',
          error
        })
      )
      .catch((callbackError) => {
        logger.error({
          message: 'Failed to persist replay upload failure state',
          recordingSessionId: activeUpload.recordingSessionId,
          eventId: activeUpload.eventId,
          error: normalizeError(callbackError).message
        });
      });
  };

  const abortUpload = ({ recordingSessionId, reason = 'recording_aborted' }) => {
    const activeUpload = removeActiveUpload(recordingSessionId);
    if (!activeUpload) {
      return false;
    }

    activeUpload.abortReason = reason;
    activeUpload.failure = new Error(reason);
    if (typeof activeUpload.stream.destroy === 'function') {
      activeUpload.stream.destroy(activeUpload.failure);
    }

    logger.warn({
      message: 'Aborted active replay upload',
      recordingSessionId,
      eventId: activeUpload.eventId,
      reason
    });

    return true;
  };

  const scheduleIdleAbort = (activeUpload) => {
    clearIdleTimer(activeUpload);
    activeUpload.idleTimer = setTimeout(() => {
      abortUpload({
        recordingSessionId: activeUpload.recordingSessionId,
        reason: 'recording_upload_timed_out'
      });
    }, idleTimeoutMs);

    if (typeof activeUpload.idleTimer.unref === 'function') {
      activeUpload.idleTimer.unref();
    }
  };

  const getActiveUpload = (recordingSessionId) => {
    const activeUpload = activeUploads.get(recordingSessionId);
    if (!activeUpload) {
      throw new AppError('Recording session not found', 404, 'recording_session_not_found');
    }

    if (activeUpload.failure) {
      throw new AppError(
        activeUpload.failure.message || 'Recording upload is no longer active',
        409,
        'recording_session_inactive'
      );
    }

    return activeUpload;
  };

  const startUpload = ({ eventId, organizerId, mimeType }) => {
    assertConfigured();

    const existingRecordingSessionId = activeUploadByEventId.get(eventId);
    if (existingRecordingSessionId) {
      abortUpload({
        recordingSessionId: existingRecordingSessionId,
        reason: 'recording_restarted'
      });
    }

    const recordingSessionId = crypto.randomUUID();
    const publicIdSuffix = `${Date.now()}-${recordingSessionId.slice(0, 8)}`;
    const folder = `pulseroom/replays/${eventId}`;

    let resolveResult;
    let rejectResult;
    const resultPromise = new Promise((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    const stream = cloudinary.uploader.upload_chunked_stream(
      {
        resource_type: 'video',
        folder,
        public_id: publicIdSuffix,
        overwrite: true,
        invalidate: true,
        chunk_size: 6_000_000,
        context: {
          event_id: eventId,
          organizer_id: organizerId,
          source: 'pulseroom-live-replay'
        }
      },
      (error, result) => {
        if (error) {
          rejectResult(normalizeError(error));
          return;
        }

        resolveResult(result);
      }
    );

    stream.on('error', (error) => {
      rejectResult(normalizeError(error));
    });

    const activeUpload = {
      recordingSessionId,
      eventId,
      organizerId,
      mimeType,
      publicId: `${folder}/${publicIdSuffix}`,
      stream,
      resultPromise,
      uploadedChunks: 0,
      bytes: 0,
      failure: null,
      failureNotified: false,
      abortReason: '',
      idleTimer: null
    };

    resultPromise.then(
      () => {
        removeActiveUpload(recordingSessionId);
      },
      (error) => {
        const failure = activeUpload.failure || normalizeError(error);
        activeUpload.failure = failure;
        removeActiveUpload(recordingSessionId);
        notifyUploadFailure(activeUpload, failure);
      }
    );

    activeUploads.set(recordingSessionId, activeUpload);
    activeUploadByEventId.set(eventId, recordingSessionId);
    scheduleIdleAbort(activeUpload);

    return {
      recordingSessionId,
      publicId: activeUpload.publicId
    };
  };

  const appendChunk = async ({ recordingSessionId, buffer }) => {
    const activeUpload = getActiveUpload(recordingSessionId);
    scheduleIdleAbort(activeUpload);

    try {
      await new Promise((resolve, reject) => {
        activeUpload.stream.write(buffer, (error) => {
          if (error) {
            reject(normalizeError(error));
            return;
          }
          resolve();
        });
      });
    } catch (error) {
      activeUpload.failure = normalizeError(error);

      if (typeof activeUpload.stream.destroy === 'function' && !activeUpload.stream.destroyed) {
        activeUpload.stream.destroy(activeUpload.failure);
      }

      throw activeUpload.failure;
    }

    activeUpload.uploadedChunks += 1;
    activeUpload.bytes += buffer.length;

    return {
      recordingSessionId,
      uploadedChunks: activeUpload.uploadedChunks,
      bytes: activeUpload.bytes
    };
  };

  const finalizeUpload = async ({ recordingSessionId }) => {
    const activeUpload = getActiveUpload(recordingSessionId);
    clearIdleTimer(activeUpload);

    const resultPromise = activeUpload.resultPromise;
    activeUpload.stream.end();
    const result = await resultPromise;
    removeActiveUpload(recordingSessionId);

    return {
      result,
      uploadedChunks: activeUpload.uploadedChunks,
      bytes: activeUpload.bytes
    };
  };

  const abortUploadForEvent = ({ eventId, reason }) => {
    const recordingSessionId = activeUploadByEventId.get(eventId);
    if (!recordingSessionId) {
      return false;
    }

    return abortUpload({ recordingSessionId, reason });
  };

  return {
    abortUpload,
    abortUploadForEvent,
    appendChunk,
    finalizeUpload,
    startUpload
  };
};

module.exports = {
  createRecordingUploadService
};
