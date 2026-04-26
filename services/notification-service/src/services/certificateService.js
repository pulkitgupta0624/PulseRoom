const PDFDocument = require('pdfkit');

const formatEventDate = ({ startsAt, endsAt }) => {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  const formatter = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  if (!end || start.toDateString() === end.toDateString()) {
    return formatter.format(start);
  }

  return `${formatter.format(start)} - ${formatter.format(end)}`;
};

const buildCertificateFileName = ({ attendeeName, eventTitle }) =>
  `${String(attendeeName || 'attendee')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}-${String(eventTitle || 'event')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}-certificate.pdf`;

const generateCertificatePdf = ({
  attendeeName,
  eventTitle,
  startsAt,
  endsAt,
  organizerSignatureName
}) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 48
    });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const dateLabel = formatEventDate({ startsAt, endsAt });
    const signatureName = organizerSignatureName || 'PulseRoom Organizer';

    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f8f4ec');
    doc
      .roundedRect(24, 24, doc.page.width - 48, doc.page.height - 48, 24)
      .lineWidth(2)
      .stroke('#1f6f8b');

    doc.fillColor('#1f6f8b').font('Helvetica-Bold').fontSize(18).text('PulseRoom', 56, 54, {
      align: 'center'
    });
    doc.fillColor('#1c1c1c').font('Helvetica-Bold').fontSize(32).text('Certificate of Attendance', 56, 108, {
      align: 'center'
    });
    doc
      .fillColor('#5a5a5a')
      .font('Helvetica')
      .fontSize(16)
      .text('This certifies that', 56, 174, { align: 'center' });

    doc.fillColor('#1c1c1c').font('Helvetica-Bold').fontSize(30).text(attendeeName, 56, 214, {
      align: 'center'
    });

    doc
      .fillColor('#5a5a5a')
      .font('Helvetica')
      .fontSize(16)
      .text('participated in', 56, 268, { align: 'center' });

    doc.fillColor('#1c1c1c').font('Helvetica-Bold').fontSize(24).text(eventTitle, 56, 304, {
      align: 'center'
    });

    doc
      .fillColor('#5a5a5a')
      .font('Helvetica')
      .fontSize(16)
      .text(`Held on ${dateLabel}`, 56, 356, { align: 'center' });

    doc
      .moveTo(doc.page.width / 2 - 120, 460)
      .lineTo(doc.page.width / 2 + 120, 460)
      .lineWidth(1)
      .stroke('#1f6f8b');

    doc
      .fillColor('#1c1c1c')
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(signatureName, doc.page.width / 2 - 180, 468, {
        width: 360,
        align: 'center'
      });
    doc
      .fillColor('#5a5a5a')
      .font('Helvetica')
      .fontSize(12)
      .text('Organizer Signature', doc.page.width / 2 - 180, 494, {
        width: 360,
        align: 'center'
      });

    doc.end();
  });

module.exports = {
  buildCertificateFileName,
  generateCertificatePdf
};
