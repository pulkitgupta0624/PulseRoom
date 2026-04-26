import { useEffect, useRef, useState } from 'react';

const pad = (value) => String(value).padStart(2, '0');

const toIcalDate = (value) => {
  const date = new Date(value);
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
};

const buildGoogleCalUrl = (event) => {
  const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
  const title = encodeURIComponent(event.title || 'PulseRoom Event');
  const start = toIcalDate(event.startsAt);
  const end = toIcalDate(event.endsAt || event.startsAt);
  const location = encodeURIComponent(
    [event.venueName, event.city, event.country].filter(Boolean).join(', ') ||
      event.streamUrl ||
      'Online'
  );
  const details = encodeURIComponent(
    `${event.summary || ''}\n\nView on PulseRoom: ${window.location.href}`
  );

  return `${base}&text=${title}&dates=${start}/${end}&location=${location}&details=${details}`;
};

const buildOutlookUrl = (event) =>
  `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(
    event.title || ''
  )}&startdt=${new Date(event.startsAt).toISOString()}&enddt=${new Date(
    event.endsAt || event.startsAt
  ).toISOString()}&body=${encodeURIComponent(event.summary || '')}&location=${encodeURIComponent(
    [event.venueName, event.city, event.country].filter(Boolean).join(', ') || event.streamUrl || 'Online'
  )}`;

const AddToCalendarButton = ({ event }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handler = (inputEvent) => {
      if (ref.current && !ref.current.contains(inputEvent.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!event?._id || !event?.startsAt) {
    return null;
  }

  const icsUrl = `${apiBaseUrl.replace(/\/$/, '')}/api/events/${event._id}/calendar.ics`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white/80 px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-sand"
      >
        <svg className="h-4 w-4 flex-shrink-0 text-ink/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        Add to calendar
        <svg
          className={`h-3.5 w-3.5 text-ink/40 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-2 w-56 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-bloom">
          <a
            href={buildGoogleCalUrl(event)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 text-sm text-ink transition hover:bg-sand/60"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-[#4285F4]" />
            Google Calendar
          </a>

          <hr className="mx-4 border-ink/8" />

          <a
            href={icsUrl}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 text-sm text-ink transition hover:bg-sand/60"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-dusk" />
            Apple, Outlook, iCal (.ics)
          </a>

          <hr className="mx-4 border-ink/8" />

          <a
            href={buildOutlookUrl(event)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 text-sm text-ink transition hover:bg-sand/60"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-[#0072C6]" />
            Outlook Web
          </a>
        </div>
      )}
    </div>
  );
};

export default AddToCalendarButton;
