const {
  BOOKING_TICKET_QR_CODE_INDEX_NAME,
  isExpectedBookingTicketQrCodeIndex
} = require('../models/bookingIndexes');

const isNamespaceNotFoundError = (error) =>
  error?.codeName === 'NamespaceNotFound' || /ns not found/i.test(String(error?.message || ''));
const isNamespaceExistsError = (error) =>
  error?.codeName === 'NamespaceExists' || /already exists/i.test(String(error?.message || ''));

const syncBookingIndexes = async ({ BookingModel, logger }) => {
  try {
    await BookingModel.createCollection();
  } catch (error) {
    if (!isNamespaceExistsError(error)) {
      throw error;
    }
  }

  let existingIndexes = [];

  try {
    existingIndexes = await BookingModel.collection.indexes();
  } catch (error) {
    if (!isNamespaceNotFoundError(error)) {
      throw error;
    }
  }

  const qrCodeIndex = existingIndexes.find(
    (index) => index.name === BOOKING_TICKET_QR_CODE_INDEX_NAME
  );

  if (qrCodeIndex && !isExpectedBookingTicketQrCodeIndex(qrCodeIndex)) {
    await BookingModel.collection.dropIndex(BOOKING_TICKET_QR_CODE_INDEX_NAME);
    logger?.warn?.({
      message: 'Dropped legacy booking ticket QR token index before sync',
      indexName: BOOKING_TICKET_QR_CODE_INDEX_NAME
    });
  }

  await BookingModel.syncIndexes();
  logger?.info?.({
    message: 'Booking indexes synced'
  });
};

module.exports = {
  isNamespaceExistsError,
  isNamespaceNotFoundError,
  syncBookingIndexes
};
