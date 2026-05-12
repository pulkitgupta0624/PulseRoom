import { useState } from 'react';
import QRCode from 'qrcode';
import { formatDate } from '../lib/formatters';

const TicketDownloadButton = ({ booking, ticket = booking?.ticket }) => {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  if (!ticket?.qrCodeValue || booking?.status !== 'confirmed') {
    return null;
  }

  const draw = async () => {
    setDownloading(true);
    setError(null);

    try {
      const width = 640;
      const height = 860;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#f5efe4';
      ctx.fillRect(0, 0, width, height);

      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, '#1f2a44');
      gradient.addColorStop(1, '#0d4f4c');
      ctx.fillStyle = gradient;
      roundRect(ctx, 0, 0, width, 130, { tl: 0, tr: 0, br: 40, bl: 40 });
      ctx.fill();

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
      ctx.fillText(`E-TICKET  ${ticket.ticketNumber || ''}`.trim(), 106, 80);

      ctx.font = 'bold 10px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'right';
      const statusLabel = ticket.checkedIn ? 'CHECKED IN' : 'VALID';
      const statusColor = ticket.checkedIn ? '#0da7a2' : '#ef6a4a';
      ctx.fillStyle = statusColor;
      const statusWidth = ctx.measureText(statusLabel).width + 24;
      roundRect(ctx, width - 20 - statusWidth, 44, statusWidth, 26, 13);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(statusLabel, width - 32, 62);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#121212';
      ctx.font = 'bold 26px "Space Grotesk", sans-serif';
      const titleRaw = booking.eventSnapshot?.title || 'Event';
      const title = titleRaw.length > 38 ? `${titleRaw.slice(0, 38)}...` : titleRaw;
      ctx.fillText(title, width / 2, 185);

      const metaY = 215;
      ctx.font = '13px "IBM Plex Sans", sans-serif';
      ctx.fillStyle = '#6f665d';
      ctx.fillText(formatDate(booking.eventSnapshot?.startsAt), width / 2, metaY);

      ctx.fillStyle = '#0da7a2';
      ctx.fillText(
        `${booking.tierName}  -  ${ticket.ticketNumber || `Ticket ${ticket.position || 1}`}`,
        width / 2,
        metaY + 24
      );

      const qrDataUrl = await QRCode.toDataURL(ticket.qrCodeValue, {
        width: 260,
        margin: 1,
        color: { dark: '#121212', light: '#f5efe4' }
      });

      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const qrX = (width - 260) / 2;
          ctx.fillStyle = '#fff';
          roundRect(ctx, qrX - 16, 258, 292, 292, 20);
          ctx.fill();
          ctx.drawImage(img, qrX, 274, 260, 260);
          resolve();
        };
        img.onerror = reject;
        img.src = qrDataUrl;
      });

      ctx.strokeStyle = '#d6cdc2';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(44, 582);
      ctx.lineTo(width - 44, 582);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#121212';
      ctx.font = 'bold 16px "Space Grotesk", sans-serif';
      ctx.fillText(ticket.attendee?.name || booking.attendee?.name || 'Guest', width / 2, 620);

      ctx.font = '13px "IBM Plex Sans", sans-serif';
      ctx.fillStyle = '#6f665d';
      ctx.fillText(ticket.attendee?.email || booking.attendee?.email || '-', width / 2, 642);

      ctx.font = '11px "IBM Plex Sans", monospace';
      ctx.fillStyle = '#b8afa5';
      ctx.fillText(`#${ticket.ticketNumber || booking.bookingNumber}`, width / 2, 668);

      if (booking.invoice?.invoiceNumber) {
        ctx.fillText(`Invoice ${booking.invoice.invoiceNumber}`, width / 2, 686);
      }

      ctx.fillStyle = '#e0d8cf';
      ctx.fillRect(0, 760, width, 1);

      ctx.font = '11px "IBM Plex Sans", sans-serif';
      ctx.fillStyle = '#b8afa5';
      ctx.fillText('Present this QR code at venue entry', width / 2, 796);
      ctx.fillText('Issued by PulseRoom', width / 2, 816);

      const link = document.createElement('a');
      link.download = `pulseroom-${ticket.ticketNumber || booking.bookingNumber}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (drawError) {
      console.error('[TicketDownloadButton]', drawError);
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
        className="rounded-full border border-dusk/20 bg-dusk/5 px-4 py-2 text-sm font-medium text-dusk transition hover:bg-dusk/10 disabled:opacity-50"
      >
        {downloading ? (
          <span className="flex items-center gap-2">
            <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generating...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download ticket
          </span>
        )}
      </button>
      {error && <p className="text-xs text-ember">{error}</p>}
    </div>
  );
};

function roundRect(ctx, x, y, width, height, radius) {
  const resolvedRadius =
    typeof radius === 'number'
      ? { tl: radius, tr: radius, br: radius, bl: radius }
      : radius;
  ctx.beginPath();
  ctx.moveTo(x + resolvedRadius.tl, y);
  ctx.lineTo(x + width - resolvedRadius.tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + resolvedRadius.tr);
  ctx.lineTo(x + width, y + height - resolvedRadius.br);
  ctx.quadraticCurveTo(x + width, y + height, x + width - resolvedRadius.br, y + height);
  ctx.lineTo(x + resolvedRadius.bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - resolvedRadius.bl);
  ctx.lineTo(x, y + resolvedRadius.tl);
  ctx.quadraticCurveTo(x, y, x + resolvedRadius.tl, y);
  ctx.closePath();
}

export default TicketDownloadButton;
