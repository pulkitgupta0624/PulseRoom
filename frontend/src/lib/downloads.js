import { api } from './api';

const parseContentDispositionFileName = (contentDisposition) => {
  const match = /filename="?([^"]+)"?/i.exec(contentDisposition || '');
  return match?.[1] || null;
};

const triggerBlobDownload = ({ blob, fileName }) => {
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
};

const downloadEventBookingsCsv = async (eventId, fallbackFileName = 'event-bookings.csv') => {
  const response = await api.get(`/api/bookings/event/${eventId}/export.csv`, {
    responseType: 'blob'
  });

  const fileName =
    parseContentDispositionFileName(response.headers['content-disposition']) || fallbackFileName;

  triggerBlobDownload({
    blob: new Blob([response.data], {
      type: response.headers['content-type'] || 'text/csv;charset=utf-8'
    }),
    fileName
  });
};

const downloadEventFeedbackCsv = async (eventId, fallbackFileName = 'event-feedback.csv') => {
  const response = await api.get(`/api/events/${eventId}/feedback/manage/export.csv`, {
    responseType: 'blob'
  });

  const fileName =
    parseContentDispositionFileName(response.headers['content-disposition']) || fallbackFileName;

  triggerBlobDownload({
    blob: new Blob([response.data], {
      type: response.headers['content-type'] || 'text/csv;charset=utf-8'
    }),
    fileName
  });
};

const downloadTextFile = ({
  content,
  fileName,
  mimeType = 'text/plain;charset=utf-8'
}) => {
  triggerBlobDownload({
    blob: new Blob([content], {
      type: mimeType
    }),
    fileName
  });
};

const sanitizeFileName = (value, fallback = 'download') =>
  String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;

const escapeIcsText = (value) =>
  String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

const toIcsDate = (value) =>
  new Date(value || Date.now())
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');

const downloadAgendaCalendar = ({ eventTitle, sessions = [], venueName = '' }) => {
  const calendarLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PulseRoom//Personal Agenda//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  sessions.forEach((session, index) => {
    calendarLines.push('BEGIN:VEVENT');
    calendarLines.push(`UID:${escapeIcsText(session.sessionKey || `session-${index + 1}`)}@pulseroom`);
    calendarLines.push(`DTSTAMP:${toIcsDate(Date.now())}`);
    calendarLines.push(`DTSTART:${toIcsDate(session.startsAt)}`);
    calendarLines.push(`DTEND:${toIcsDate(session.endsAt || session.startsAt)}`);
    calendarLines.push(`SUMMARY:${escapeIcsText(session.title || 'Session')}`);

    const description = [
      session.description,
      Array.isArray(session.speakerNames) && session.speakerNames.length
        ? `Speakers: ${session.speakerNames.join(', ')}`
        : ''
    ]
      .filter(Boolean)
      .join('\n');

    if (description) {
      calendarLines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    }

    const location = [venueName, session.roomLabel].filter(Boolean).join(' - ');
    if (location) {
      calendarLines.push(`LOCATION:${escapeIcsText(location)}`);
    }

    calendarLines.push('END:VEVENT');
  });

  calendarLines.push('END:VCALENDAR');

  downloadTextFile({
    content: calendarLines.join('\r\n'),
    fileName: `${sanitizeFileName(eventTitle, 'event')}-agenda.ics`,
    mimeType: 'text/calendar;charset=utf-8'
  });
};

export { downloadAgendaCalendar, downloadEventBookingsCsv, downloadEventFeedbackCsv, downloadTextFile };
