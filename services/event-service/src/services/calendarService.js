const { slugify } = require('./slugify');

const pad = (value) => String(value).padStart(2, '0');

const toIcalDate = (value) => {
  const date = new Date(value);
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
};

const escapeIcalText = (value = '') =>
  String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

const buildEventLocation = (event) =>
  [
    event.venueName,
    event.venueAddress,
    event.city,
    event.country
  ]
    .filter(Boolean)
    .join(', ') || event.streamUrl || 'Online';

const buildEventUrl = (event, appOrigin) => `${appOrigin.replace(/\/$/, '')}/events/${event._id}`;

const buildCalendarFileName = (event) => `${slugify(event.title || 'event') || 'event'}.ics`;

const buildCalendarFile = (event, appOrigin) => {
  const startsAt = toIcalDate(event.startsAt);
  const endsAt = toIcalDate(event.endsAt || event.startsAt);
  const location = escapeIcalText(buildEventLocation(event));
  const description = escapeIcalText(event.summary || event.description || '');
  const url = buildEventUrl(event, appOrigin);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PulseRoom//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event._id}@pulseroom.dev`,
    `DTSTAMP:${toIcalDate(new Date())}`,
    `DTSTART:${startsAt}`,
    `DTEND:${endsAt}`,
    `SUMMARY:${escapeIcalText(event.title)}`,
    `DESCRIPTION:${description}\\n\\nView on PulseRoom: ${escapeIcalText(url)}`,
    `LOCATION:${location}`,
    `URL:${escapeIcalText(url)}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
};

module.exports = {
  buildCalendarFile,
  buildCalendarFileName,
  buildEventLocation,
  buildEventUrl
};
