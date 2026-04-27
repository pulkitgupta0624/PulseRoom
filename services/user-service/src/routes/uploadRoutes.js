const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { authenticate, asyncHandler, sendSuccess, AppError } = require('@pulseroom/common');
const config = require('../config');

// ── Cloudinary ────────────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: config.cloudinaryCloudName,
  api_key: config.cloudinaryApiKey,
  api_secret: config.cloudinaryApiSecret,
  timeout: 30_000   // global timeout on all Cloudinary HTTP calls
});

// ── Multer ────────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new AppError('Only image files are allowed', 400, 'invalid_file'));
    }
    cb(null, true);
  }
});

// ── Helper ────────────────────────────────────────────────────────────────────
const uploadBuffer = async (buffer, mimetype, options) => {
  // Validate config before even attempting the upload
  if (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret) {
    throw new AppError(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in your .env / docker-compose.',
      503,
      'cloudinary_not_configured'
    );
  }

  const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`;

  try {
    return await cloudinary.uploader.upload(dataUri, options);
  } catch (err) {
    // Surface every available detail from the Cloudinary SDK error so the
    // real cause (bad credentials, network block, quota, etc.) is visible.
    const details = {
      message: err.message,
      http_code: err.http_code,
      name: err.name,
      error: err.error           // nested error object in some SDK versions
    };

    // Log structured details — visible in `docker compose logs user-service`
    console.error('[uploadBuffer] Cloudinary error:', JSON.stringify(details, null, 2));

    // Choose the most useful HTTP status to return to the client
    const status = err.http_code === 401
      ? 401   // bad credentials
      : err.http_code === 420 || err.http_code === 429
        ? 429 // rate-limited
        : err.http_code >= 400 && err.http_code < 500
          ? 400 // some other client error
          : 502; // upstream / network problem

    const friendlyMessage = err.http_code === 401
      ? 'Cloudinary authentication failed. Check CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.'
      : err.message || 'Cloudinary upload failed';

    throw new AppError(friendlyMessage, status, 'upload_failed');
  }
};

// ── Routes ────────────────────────────────────────────────────────────────────
const router = express.Router();

/**
 * GET /api/uploads/health
 * Quick connectivity + credentials check — no auth required.
 * Hit this first to confirm Cloudinary is reachable from the container.
 */
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    if (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret) {
      return res.status(503).json({
        success: false,
        cloudinary: 'not_configured',
        message: 'CLOUDINARY_* env vars are missing'
      });
    }

    try {
      // ping() verifies credentials AND network reachability
      const result = await cloudinary.api.ping();
      return res.status(200).json({ success: true, cloudinary: 'ok', result });
    } catch (err) {
      return res.status(502).json({
        success: false,
        cloudinary: 'error',
        http_code: err.http_code,
        message: err.message,
        hint:
          err.http_code === 401
            ? 'Invalid API credentials — check CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET'
            : 'Cannot reach Cloudinary — check Docker network / DNS'
      });
    }
  })
);

/**
 * POST /api/uploads/avatar
 */
router.post(
  '/avatar',
  authenticate(),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError('No file uploaded', 400, 'missing_file');
    }

    const result = await uploadBuffer(req.file.buffer, req.file.mimetype, {
      folder: 'pulseroom/avatars',
      public_id: `avatar_${req.user.sub}`,
      overwrite: true,
      transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }]
    });

    sendSuccess(res, { url: result.secure_url });
  })
);

/**
 * POST /api/uploads/event-cover
 */
router.post(
  '/event-cover',
  authenticate(),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError('No file uploaded', 400, 'missing_file');
    }

    const result = await uploadBuffer(req.file.buffer, req.file.mimetype, {
      folder: 'pulseroom/covers',
      transformation: [{ width: 1200, height: 630, crop: 'fill' }]
    });

    sendSuccess(res, { url: result.secure_url });
  })
);

router.post(
  '/sponsor-logo',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError('No file uploaded', 400, 'missing_file');
    }

    const result = await uploadBuffer(req.file.buffer, req.file.mimetype, {
      folder: 'pulseroom/sponsors',
      transformation: [{ width: 600, height: 600, crop: 'fit', background: 'white', pad: true }]
    });

    sendSuccess(res, { url: result.secure_url });
  })
);

module.exports = router;
