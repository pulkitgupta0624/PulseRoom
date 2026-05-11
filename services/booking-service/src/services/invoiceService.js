const PDFDocument = require('pdfkit');

const buildInvoiceNumber = () => `PR-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

const formatInvoiceCurrency = (value, currency = 'INR', locale = 'en-IN') =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
  }).format(Number(value || 0));

const buildInvoiceDocumentData = (booking) => {
  const pricing = booking?.pricing || {};
  const currency = booking?.currency || pricing.settlementCurrency || 'INR';
  const subtotalAmount = Number(pricing.subtotal ?? booking?.amount ?? 0);
  const discountAmount = Number(pricing.discountAmount || 0);
  const taxAmount = Number(pricing.taxAmount || 0);
  const totalAmount = Number(pricing.total ?? booking?.amount ?? 0);
  const taxRate = Number(pricing.taxRate || 0);
  const taxLabel = pricing.taxLabel || 'Tax';
  const registrationNumber = pricing.registrationNumber || '';

  const lineItems = [
    {
      label: `${booking?.tierName || 'Ticket'} x ${booking?.quantity || 1}`,
      amount: subtotalAmount
    }
  ];

  if (discountAmount > 0) {
    lineItems.push({
      label: booking?.promoCode?.code
        ? `Promo discount (${booking.promoCode.code})`
        : booking?.referral?.code
          ? `Referral discount (${booking.referral.code})`
          : 'Discount',
      amount: -discountAmount
    });
  }

  if (taxAmount > 0) {
    lineItems.push({
      label: `${taxLabel} (${taxRate}%)`,
      amount: taxAmount,
      registrationNumber
    });
  }

  return {
    invoiceNumber: booking?.invoice?.invoiceNumber || buildInvoiceNumber(),
    issuedAt: booking?.invoice?.issuedAt || booking?.confirmedAt || booking?.createdAt || new Date(),
    attendeeName: booking?.attendee?.name || 'Attendee',
    attendeeEmail: booking?.attendee?.email || '',
    bookingNumber: booking?.bookingNumber || '',
    eventTitle: booking?.eventSnapshot?.title || 'PulseRoom Event',
    eventStartsAt: booking?.eventSnapshot?.startsAt || null,
    currency,
    subtotalAmount,
    discountAmount,
    taxAmount,
    taxLabel,
    taxRate,
    totalAmount,
    registrationNumber,
    exchangeRate: Number(pricing.exchangeRate || 1),
    baseCurrency: pricing.baseCurrency || currency,
    lineItems
  };
};

const buildInvoicePdf = async (booking) =>
  new Promise((resolve, reject) => {
    const invoice = buildInvoiceDocumentData(booking);
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50
    });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc
      .fontSize(24)
      .fillColor('#1f2a44')
      .text('PulseRoom Invoice', 50, 48);
    doc
      .fontSize(11)
      .fillColor('#5f6675')
      .text(`Invoice ${invoice.invoiceNumber}`, 50, 86)
      .text(`Issued ${new Date(invoice.issuedAt).toLocaleString()}`, 50, 102);

    doc
      .roundedRect(50, 136, 495, 118, 14)
      .fillAndStroke('#f7f4ef', '#e3ddd2');

    doc
      .fillColor('#121826')
      .fontSize(13)
      .text('Billed To', 70, 156)
      .fontSize(12)
      .text(invoice.attendeeName, 70, 178)
      .fillColor('#5f6675')
      .text(invoice.attendeeEmail, 70, 196);

    doc
      .fillColor('#121826')
      .fontSize(13)
      .text('Booking', 320, 156)
      .fontSize(12)
      .text(`#${invoice.bookingNumber}`, 320, 178)
      .text(invoice.eventTitle, 320, 196, { width: 190 });

    if (invoice.eventStartsAt) {
      doc
        .fillColor('#5f6675')
        .fontSize(11)
        .text(`Event starts ${new Date(invoice.eventStartsAt).toLocaleString()}`, 320, 226, {
          width: 190
        });
    }

    doc
      .fillColor('#121826')
      .fontSize(13)
      .text('Line Items', 50, 286);

    let cursorY = 320;
    invoice.lineItems.forEach((item, index) => {
      if (index > 0) {
        doc
          .moveTo(50, cursorY - 10)
          .lineTo(545, cursorY - 10)
          .strokeColor('#ede7dc')
          .stroke();
      }

      doc
        .fillColor('#121826')
        .fontSize(12)
        .text(item.label, 50, cursorY);
      doc
        .fillColor('#121826')
        .fontSize(12)
        .text(formatInvoiceCurrency(item.amount, invoice.currency), 405, cursorY, {
          width: 140,
          align: 'right'
        });

      cursorY += 22;
      if (item.registrationNumber) {
        doc
          .fillColor('#5f6675')
          .fontSize(10)
          .text(`Registration: ${item.registrationNumber}`, 50, cursorY);
        cursorY += 18;
      }
    });

    cursorY += 8;
    doc
      .moveTo(50, cursorY)
      .lineTo(545, cursorY)
      .strokeColor('#d7cfbf')
      .stroke();

    cursorY += 20;
    const summaryLines = [
      ['Subtotal', invoice.subtotalAmount],
      ...(invoice.discountAmount > 0 ? [['Discount', -invoice.discountAmount]] : []),
      ...(invoice.taxAmount > 0 ? [[`${invoice.taxLabel} (${invoice.taxRate}%)`, invoice.taxAmount]] : []),
      ['Total', invoice.totalAmount]
    ];

    summaryLines.forEach(([label, amount], index) => {
      const isTotal = index === summaryLines.length - 1;
      doc
        .fillColor(isTotal ? '#1f2a44' : '#121826')
        .fontSize(isTotal ? 14 : 12)
        .text(label, 295, cursorY);
      doc
        .fillColor(isTotal ? '#1f2a44' : '#121826')
        .fontSize(isTotal ? 14 : 12)
        .text(formatInvoiceCurrency(amount, invoice.currency), 405, cursorY, {
          width: 140,
          align: 'right'
        });
      cursorY += isTotal ? 28 : 22;
    });

    if (invoice.baseCurrency !== invoice.currency && invoice.exchangeRate > 0) {
      doc
        .fillColor('#5f6675')
        .fontSize(10)
        .text(
          `Converted from ${invoice.baseCurrency} at 1 ${invoice.baseCurrency} = ${invoice.exchangeRate} ${invoice.currency}`,
          50,
          716,
          {
            width: 495
          }
        );
    }

    doc
      .fillColor('#8a93a6')
      .fontSize(10)
      .text(
        'This invoice was generated automatically by PulseRoom for your event booking records.',
        50,
        748,
        {
          width: 495
        }
      );

    doc.end();
  });

module.exports = {
  buildInvoiceNumber,
  buildInvoiceDocumentData,
  buildInvoicePdf
};
