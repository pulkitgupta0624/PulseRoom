/**
 * CameraQrScanner — v2
 *
 * Fixes vs v1:
 *
 *  1. DOUBLE-CAMERA (StrictMode race):
 *     React 18 StrictMode mounts → unmounts → remounts every component in dev.
 *     v1 started Html5Qrcode asynchronously; the second mount sometimes fired
 *     before the first async start() resolved, injecting two <video> elements
 *     into the same DOM node and triggering a camera-selection dropdown.
 *
 *     Fix: a module-level `pendingCleanup` promise. Each new mount awaits the
 *     previous instance's stop/clear chain before creating a fresh scanner.
 *     That guarantees only one instance ever touches the DOM at a time.
 *
 *  2. CAMERA LIGHT STAYS ON after navigation:
 *     v1 only called scanner.stop() but did not force-release MediaStreamTracks.
 *
 *     Fix: after stop(), iterate every <video> inside the container and call
 *     track.stop() on each track — this is the only reliable way to turn off
 *     the camera hardware light.
 *
 *  3. NEW — Upload QR scanner:
 *     Uses Html5Qrcode.scanFile() on a temporary off-screen element so the
 *     live camera feed is never interrupted. Works on any image file.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

// Module-level so StrictMode's 2nd mount always awaits the 1st mount's cleanup
let pendingCleanup = null;

/** Force-stop every camera track inside the scanner container */
const releaseTracksInContainer = (containerId) => {
  try {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.querySelectorAll('video').forEach((video) => {
      const stream = video.srcObject;
      if (stream && typeof stream.getTracks === 'function') {
        stream.getTracks().forEach((t) => t.stop());
      }
      video.srcObject = null;
    });
  } catch {
    /* best-effort */
  }
};

/** Fully stop a scanner instance and release hardware */
const stopScanner = (scanner, containerId) =>
  (scanner.isScanning ? scanner.stop().catch(() => {}) : Promise.resolve())
    .then(() => scanner.clear().catch(() => {}))
    .then(() => releaseTracksInContainer(containerId))
    .catch(() => {});

const CameraQrScanner = ({ onScanSuccess }) => {
  const elementId = useRef(
    `qr-cam-${Math.random().toString(36).slice(2, 9)}`
  ).current;

  const scannerRef   = useRef(null);
  const cancelledRef = useRef(false);
  const lastScanRef  = useRef({ text: '', at: 0 });
  const onScanRef    = useRef(onScanSuccess);

  useEffect(() => { onScanRef.current = onScanSuccess; }, [onScanSuccess]);

  const [camStatus, setCamStatus] = useState('starting');
  const [camError,  setCamError]  = useState(null);
  const [uploadState, setUploadState] = useState('idle');
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  // ── Camera lifecycle ──────────────────────────────────────────────────────────
  useEffect(() => {
    cancelledRef.current = false;

    const start = async () => {
      // Wait for any in-progress cleanup from StrictMode's previous mount
      if (pendingCleanup) {
        await pendingCleanup.catch(() => {});
        pendingCleanup = null;
      }
      if (cancelledRef.current) return;

      let scanner;
      try {
        scanner = new Html5Qrcode(elementId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            if (cancelledRef.current) return;
            const now = Date.now();
            if (
              lastScanRef.current.text === decodedText &&
              now - lastScanRef.current.at < 4_000
            ) return;
            lastScanRef.current = { text: decodedText, at: now };
            onScanRef.current(decodedText);
          },
          () => {} // QR not found — ignore
        );

        if (cancelledRef.current) {
          stopScanner(scanner, elementId);
          return;
        }
        setCamStatus('ready');
      } catch (err) {
        if (cancelledRef.current) return;
        console.error('[CameraQrScanner]', err);
        setCamStatus('error');
        setCamError(
          'Camera access failed. Make sure the page is on HTTPS (or localhost) ' +
          'and camera permission is granted in your browser. ' +
          'You can still scan tickets using the Upload Image option below.'
        );
      }
    };

    start();

    return () => {
      cancelledRef.current = true;
      const sc = scannerRef.current;
      scannerRef.current = null;
      if (sc) {
        // Store the promise so the next mount can await full teardown
        pendingCleanup = stopScanner(sc, elementId);
      }
    };
  }, [elementId]);

  // ── Upload QR handler ─────────────────────────────────────────────────────────
  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadState('scanning');
    setUploadError(null);

    // Use a hidden off-screen element — never touches the live camera div
    const tempId = `qr-upload-${Date.now()}`;
    const tempEl = document.createElement('div');
    tempEl.id = tempId;
    tempEl.style.display = 'none';
    document.body.appendChild(tempEl);
    const tempScanner = new Html5Qrcode(tempId);

    try {
      const result = await tempScanner.scanFile(file, false);
      setUploadState('ok');
      setTimeout(() => {
        onScanRef.current(result);
        setUploadState('idle');
      }, 700);
    } catch {
      setUploadState('error');
      setUploadError(
        'No QR code detected. Try a clearer, well-lit photo of the ticket and make sure ' +
        'the whole QR code is visible.'
      );
    } finally {
      await tempScanner.clear().catch(() => {});
      tempEl.remove();
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Live camera feed */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-4 shadow-bloom">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
          Live Camera
        </p>
        <div id={elementId} className="overflow-hidden rounded-[20px]" />
      </div>

      {/* Camera status */}
      <div
        className={`rounded-2xl px-4 py-3 text-sm ${
          camStatus === 'error'
            ? 'border border-ember/20 bg-ember/5 text-ember'
            : 'bg-sand/70 text-ink/60'
        }`}
      >
        {camStatus === 'starting' && (
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-reef border-t-transparent" />
            Starting camera…
          </span>
        )}
        {camStatus === 'ready' && (
          <span className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-reef opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-reef" />
            </span>
            Camera active — point at a PulseRoom QR ticket
          </span>
        )}
        {camStatus === 'error' && (
          <div className="space-y-2">
            <p className="font-semibold">Camera unavailable</p>
            <p className="text-xs opacity-80">{camError}</p>
            <ul className="list-inside list-disc space-y-0.5 text-xs opacity-70">
              <li>Open the app on <strong>https://</strong> or <strong>localhost</strong></li>
              <li>Click the camera icon in the address bar → <strong>Allow</strong></li>
              <li>Mobile: Settings → Browser → Camera → Allow</li>
              <li>Use the <strong>Upload Image</strong> option below ↓</li>
            </ul>
          </div>
        )}
      </div>

      {/* Upload QR Image */}
      <div className="rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-bloom space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
            Upload QR Image
          </p>
          <p className="mt-1 text-sm text-ink/60">
            Take a photo of the attendee's ticket and upload it here. Works even when
            the camera is blocked or the code is hard to scan live.
          </p>
        </div>

        <label
          htmlFor="qr-upload-input"
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[20px] border-2 border-dashed px-6 py-8 transition ${
            uploadState === 'scanning'
              ? 'border-reef/40 bg-reef/5'
              : uploadState === 'ok'
              ? 'border-reef bg-reef/5'
              : uploadState === 'error'
              ? 'border-ember/40 bg-ember/5'
              : 'border-ink/15 bg-sand/50 hover:border-reef/40 hover:bg-reef/5'
          }`}
        >
          {uploadState === 'scanning' && (
            <>
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-reef border-t-transparent" />
              <span className="text-sm font-medium text-reef">Scanning image…</span>
            </>
          )}

          {uploadState === 'ok' && (
            <>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-reef/15">
                <svg className="h-5 w-5 text-reef" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="text-sm font-semibold text-reef">QR code found — processing…</span>
            </>
          )}

          {uploadState === 'error' && (
            <>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ember/10">
                <svg className="h-5 w-5 text-ember" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </span>
              <span className="text-sm font-semibold text-ember">No QR code found</span>
              <p className="max-w-xs text-center text-xs text-ember/80">{uploadError}</p>
              <span className="rounded-full border border-ember/25 bg-white px-3 py-1 text-xs font-medium text-ember">
                Choose another image
              </span>
            </>
          )}

          {uploadState === 'idle' && (
            <>
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-white">
                <svg className="h-5 w-5 text-ink/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </span>
              <div className="text-center">
                <p className="text-sm font-medium text-ink">Click to choose an image</p>
                <p className="text-xs text-ink/45">or drag-and-drop a ticket photo here</p>
              </div>
              <span className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-sand">
                Browse files
              </span>
            </>
          )}
        </label>

        <input
          id="qr-upload-input"
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploadState === 'scanning'}
        />
      </div>
    </div>
  );
};

export default CameraQrScanner;