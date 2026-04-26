import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { formatDate } from '../lib/formatters';

const QRCodeTicket = ({ value, title = 'Ticket QR', checkedIn = false, checkedInAt = null }) => {
  const [imageSrc, setImageSrc] = useState('');

  useEffect(() => {
    let active = true;

    const render = async () => {
      if (!value) {
        setImageSrc('');
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(value, {
          width: 240,
          margin: 1,
          color: {
            dark: '#121212',
            light: '#f8f1e7'
          }
        });

        if (active) {
          setImageSrc(dataUrl);
        }
      } catch {
        if (active) {
          setImageSrc('');
        }
      }
    };

    render();
    return () => {
      active = false;
    };
  }, [value]);

  if (!value) {
    return null;
  }

  return (
    <div className="rounded-[24px] border border-ink/10 bg-sand/65 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-ink/45">{title}</p>
          <p className="mt-1 text-sm text-ink/60">Show this at venue entry for scanning.</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
            checkedIn ? 'bg-reef/10 text-reef' : 'bg-dusk/10 text-dusk'
          }`}
        >
          {checkedIn ? 'Checked in' : 'Ready'}
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-[20px] border border-ink/8 bg-white p-4">
        {imageSrc ? (
          <img src={imageSrc} alt="Ticket QR code" className="mx-auto h-56 w-56" />
        ) : (
          <div className="flex h-56 items-center justify-center">
            <div className="h-8 w-8 rounded-full border-2 border-reef border-t-transparent animate-spin" />
          </div>
        )}
      </div>

      {checkedInAt && (
        <p className="mt-3 text-xs text-ink/45">Checked in on {formatDate(checkedInAt)}</p>
      )}
    </div>
  );
};

export default QRCodeTicket;
