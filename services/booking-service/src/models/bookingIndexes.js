const BOOKING_TICKET_QR_CODE_INDEX_NAME = 'tickets.qrCodeToken_1';

const bookingTicketQrCodeIndexKeys = {
  'tickets.qrCodeToken': 1
};

const bookingTicketQrCodeIndexOptions = {
  name: BOOKING_TICKET_QR_CODE_INDEX_NAME,
  unique: true,
  partialFilterExpression: {
    'tickets.qrCodeToken': {
      $type: 'string'
    }
  }
};

const isExpectedBookingTicketQrCodeIndex = (index = {}) =>
  index.name === BOOKING_TICKET_QR_CODE_INDEX_NAME &&
  index.unique === true &&
  index.key?.['tickets.qrCodeToken'] === 1 &&
  index.partialFilterExpression?.['tickets.qrCodeToken']?.$type === 'string';

module.exports = {
  BOOKING_TICKET_QR_CODE_INDEX_NAME,
  bookingTicketQrCodeIndexKeys,
  bookingTicketQrCodeIndexOptions,
  isExpectedBookingTicketQrCodeIndex
};
