const Booking = require('./Booking');
const {
  BOOKING_TICKET_QR_CODE_INDEX_NAME
} = require('./bookingIndexes');

describe('Booking schema', () => {
  it('defines a partial unique index for ticket qr code tokens', () => {
    const qrCodeIndex = Booking.schema
      .indexes()
      .find(([, options]) => options.name === BOOKING_TICKET_QR_CODE_INDEX_NAME);

    expect(qrCodeIndex).toEqual([
      {
        'tickets.qrCodeToken': 1
      },
      expect.objectContaining({
        name: BOOKING_TICKET_QR_CODE_INDEX_NAME,
        unique: true,
        partialFilterExpression: {
          'tickets.qrCodeToken': {
            $type: 'string'
          }
        }
      })
    ]);
  });
});
