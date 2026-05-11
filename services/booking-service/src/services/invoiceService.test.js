const {
  buildInvoiceNumber,
  buildInvoiceDocumentData,
  buildInvoicePdf
} = require('./invoiceService');

describe('buildInvoiceNumber', () => {
  it('generates invoice identifiers with the expected prefix', () => {
    expect(buildInvoiceNumber()).toMatch(/^PR-\d{13}-\d{3}$/);
  });
});

describe('buildInvoiceDocumentData', () => {
  it('includes a tax line item with a registration number when tax applies', () => {
    const invoice = buildInvoiceDocumentData({
      bookingNumber: 'BK-1',
      tierName: 'VIP',
      quantity: 2,
      currency: 'USD',
      attendee: {
        name: 'Ava',
        email: 'ava@example.com'
      },
      eventSnapshot: {
        title: 'PulseRoom Live'
      },
      invoice: {
        invoiceNumber: 'INV-1',
        issuedAt: '2026-05-01T10:00:00.000Z'
      },
      pricing: {
        baseCurrency: 'INR',
        settlementCurrency: 'USD',
        exchangeRate: 0.012,
        subtotal: 120,
        discountAmount: 20,
        taxAmount: 18,
        taxLabel: 'GST',
        taxRate: 18,
        total: 118,
        registrationNumber: 'GST-IN-1234'
      },
      promoCode: {
        code: 'EARLY20'
      }
    });

    expect(invoice.lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'GST (18%)',
          registrationNumber: 'GST-IN-1234',
          amount: 18
        })
      ])
    );
  });
});

describe('buildInvoicePdf', () => {
  it('renders a non-empty PDF buffer', async () => {
    const buffer = await buildInvoicePdf({
      bookingNumber: 'BK-2',
      tierName: 'General',
      quantity: 1,
      currency: 'GBP',
      attendee: {
        name: 'Kai',
        email: 'kai@example.com'
      },
      eventSnapshot: {
        title: 'Launch Day'
      },
      invoice: {
        invoiceNumber: 'INV-2',
        issuedAt: '2026-05-01T10:00:00.000Z'
      },
      pricing: {
        subtotal: 50,
        discountAmount: 0,
        taxAmount: 10,
        taxLabel: 'VAT',
        taxRate: 20,
        total: 60,
        registrationNumber: 'VAT-UK-2026'
      }
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
