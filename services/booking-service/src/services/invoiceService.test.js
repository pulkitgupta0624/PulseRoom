const { buildInvoiceNumber } = require('./invoiceService');

describe('buildInvoiceNumber', () => {
  it('generates invoice identifiers with the expected prefix', () => {
    expect(buildInvoiceNumber()).toMatch(/^PR-\d{13}-\d{3}$/);
  });
});

