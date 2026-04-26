import { useState } from 'react';
import QRCode from 'qrcode';
import { formatDate } from '../lib/formatters';

/**
 * TicketDownloadButton
 * Renders a styled e-ticket PNG to a hidden canvas and triggers a download.
 * Drop it into BookingsPage next to any confirmed booking card.
 *
 * Props:
 *   booking  – serialised booking object returned by serializeBooking()
 */
const TicketDownloadButton = ({ booking }) => {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  if (!booking?.ticket?.qrCodeValue || booking.status !== 'confirmed') {
    return null;
  }

  const draw = async () => {
    setDownloading(true);
    setError(null);

    try {
      const W = 640;
      const H = 860;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');

      /* ── background ──────────────────────────────────────────────────── */
      ctx.fillStyle = '#f5efe4';
      ctx.fillRect(0, 0, W, H);

      /* ── top band ────────────────────────────────────────────────────── */
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, '#1f2a44');
      grad.addColorStop(1, '#0d4f4c');
      ctx.fillStyle = grad;
      roundRect(ctx, 0, 0, W, 130, { tl: 0, tr: 0, br: 40, bl: 40 });
      ctx.fill();

      /* logo mark */
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(60, 65, 36, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f5efe4';
      ctx.font = 'bold 22px "Space Grotesk", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('PulseRoom', 106, 58);

      ctx.font = '11px "IBM Plex Sans", sans-serif';
      ctx.fillStyle = 'rgba(245,239,228,0.60)';
      ctx.fillText('E-TICKET · ADMIT ONE', 106, 80);

      /* status pill */
      const statusX = W - 20;
      ctx.font = 'bold 10px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'right';
      const statusLabel = booking.ticket.checkedIn ? 'CHECKED IN' : 'VALID';
      const statusColor = booking.ticket.checkedIn ? '#0da7a2' : '#ef6a4a';
      ctx.fillStyle = statusColor;
      const sw = ctx.measureText(statusLabel).width + 24;
      roundRect(ctx, statusX - sw, 44, sw, 26, 13);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(statusLabel, statusX - 12, 62);

      /* ── event title ─────────────────────────────────────────────────── */
      ctx.textAlign = 'center';
      ctx.fillStyle = '#121212';
      ctx.font = 'bold 26px "Space Grotesk", sans-serif';
      const titleRaw = booking.eventSnapshot?.title || 'Event';
      const title = titleRaw.length > 38 ? titleRaw.slice(0, 38) + '…' : titleRaw;
      ctx.fillText(title, W / 2, 185);

      /* ── meta grid ───────────────────────────────────────────────────── */
      const metaY = 215;
      ctx.font = '13px "IBM Plex Sans", sans-serif';
      ctx.fillStyle = '#6f665d';
      ctx.fillText(formatDate(booking.eventSnapshot?.startsAt), W / 2, metaY);

      ctx.font = '13px "IBM Plex Sans", sans-serif';
      ctx.fillStyle = '#0da7a2';
      ctx.fillText(`${booking.tierName}  ×  ${booking.quantity}`, W / 2, metaY + 24);

      /* ── QR code ─────────────────────────────────────────────────────── */
      const qrDataUrl = await QRCode.toDataURL(booking.ticket.qrCodeValue, {
        width: 260,
        margin: 1,
        color: { dark: '#121212', light: '#f5efe4' }
      });

      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const qX = (W - 260) / 2;
          /* QR container */
          ctx.fillStyle = '#fff';
          roundRect(ctx, qX - 16, 258, 292, 292, 20);
          ctx.fill();
          ctx.drawImage(img, qX, 274, 260, 260);
          resolve();
        };
        img.onerror = reject;
        img.src = qrDataUrl;
      });

      /* ── tear line ───────────────────────────────────────────────────── */
      ctx.strokeStyle = '#d6cdc2';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(44, 582);
      ctx.lineTo(W - 44, 582);
      ctx.stroke();
      ctx.setLineDash([]);

      /* scissors icon hint */
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#b8afa5';
      ctx.fillText('✂', 26, 587);

      /* ── attendee block ──────────────────────────────────────────────── */
      ctx.fillStyle = '#121212';
      ctx.font = 'bold 16px "Space Grotesk", sans-serif';
      ctx.fillText(booking.attendee?.name || '—', W / 2, 620);

      ctx.font = '13px "IBM Plex Sans", sans-serif';
      ctx.fillStyle = '#6f665d';
      ctx.fillText(booking.attendee?.email || '—', W / 2, 642);

      /* booking number */
      ctx.font = '11px "IBM Plex Sans", monospace';
      ctx.fillStyle = '#b8afa5';
      ctx.fillText(`#${booking.bookingNumber}`, W / 2, 668);

      /* invoice */
      if (booking.invoice?.invoiceNumber) {
        ctx.fillText(`Invoice ${booking.invoice.invoiceNumber}`, W / 2, 686);
      }

      /* ── footer ──────────────────────────────────────────────────────── */
      ctx.fillStyle = '#e0d8cf';
      ctx.fillRect(0, 760, W, 1);

      ctx.font = '11px "IBM Plex Sans", sans-serif';
      ctx.fillStyle = '#b8afa5';
      ctx.fillText('Present this QR code at venue entry · Non-transferable', W / 2, 796);
      ctx.fillText('Issued by PulseRoom · pulseroom.dev', W / 2, 816);

      /* ── download ────────────────────────────────────────────────────── */
      const link = document.createElement('a');
      link.download = `pulseroom-ticket-${booking.bookingNumber}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('[TicketDownloadButton]', err);
      setError('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={draw}
        disabled={downloading}
        className="rounded-full border border-dusk/20 bg-dusk/5 px-4 py-2 text-sm font-medium text-dusk hover:bg-dusk/10 disabled:opacity-50 transition"
      >
        {downloading ? (
          <span className="flex items-center gap-2">
            <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generating…
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download ticket
          </span>
        )}
      </button>
      {error && <p className="text-xs text-ember">{error}</p>}
    </div>
  );
};

/* helper — roundRect polyfill for older contexts */
function roundRect(ctx, x, y, w, h, r) {
  const radius = typeof r === 'number' ? { tl: r, tr: r, br: r, bl: r } : r;
  ctx.beginPath();
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + w - radius.tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius.tr);
  ctx.lineTo(x + w, y + h - radius.br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius.br, y + h);
  ctx.lineTo(x + radius.bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius.bl);
  ctx.lineTo(x, y + radius.tl);
  ctx.quadraticCurveTo(x, y, x + radius.tl, y);
  ctx.closePath();
}

export default TicketDownloadButton;