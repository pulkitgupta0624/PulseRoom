const {
  BOOKING_TICKET_QR_CODE_INDEX_NAME
} = require('../models/bookingIndexes');
const { syncBookingIndexes } = require('./bookingIndexService');

describe('bookingIndexService', () => {
  const logger = {
    info: jest.fn(),
    warn: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('drops the legacy sparse qr token index before syncing', async () => {
    const BookingModel = {
      createCollection: jest.fn().mockRejectedValue(
        Object.assign(new Error('collection already exists'), {
          codeName: 'NamespaceExists'
        })
      ),
      collection: {
        indexes: jest.fn().mockResolvedValue([
          {
            name: BOOKING_TICKET_QR_CODE_INDEX_NAME,
            key: {
              'tickets.qrCodeToken': 1
            },
            unique: true,
            sparse: true
          }
        ]),
        dropIndex: jest.fn().mockResolvedValue(undefined)
      },
      syncIndexes: jest.fn().mockResolvedValue([])
    };

    await syncBookingIndexes({ BookingModel, logger });

    expect(BookingModel.collection.dropIndex).toHaveBeenCalledWith(
      BOOKING_TICKET_QR_CODE_INDEX_NAME
    );
    expect(BookingModel.syncIndexes).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('keeps the partial qr token index when it is already correct', async () => {
    const BookingModel = {
      createCollection: jest.fn().mockRejectedValue(
        Object.assign(new Error('collection already exists'), {
          codeName: 'NamespaceExists'
        })
      ),
      collection: {
        indexes: jest.fn().mockResolvedValue([
          {
            name: BOOKING_TICKET_QR_CODE_INDEX_NAME,
            key: {
              'tickets.qrCodeToken': 1
            },
            unique: true,
            partialFilterExpression: {
              'tickets.qrCodeToken': {
                $type: 'string'
              }
            }
          }
        ]),
        dropIndex: jest.fn().mockResolvedValue(undefined)
      },
      syncIndexes: jest.fn().mockResolvedValue([])
    };

    await syncBookingIndexes({ BookingModel, logger });

    expect(BookingModel.collection.dropIndex).not.toHaveBeenCalled();
    expect(BookingModel.syncIndexes).toHaveBeenCalledTimes(1);
  });

  it('still syncs indexes when the booking collection does not exist yet', async () => {
    const BookingModel = {
      createCollection: jest.fn().mockResolvedValue(undefined),
      collection: {
        indexes: jest.fn().mockRejectedValue(
          Object.assign(new Error('ns not found'), {
            codeName: 'NamespaceNotFound'
          })
        ),
        dropIndex: jest.fn().mockResolvedValue(undefined)
      },
      syncIndexes: jest.fn().mockResolvedValue([])
    };

    await syncBookingIndexes({ BookingModel, logger });

    expect(BookingModel.collection.dropIndex).not.toHaveBeenCalled();
    expect(BookingModel.syncIndexes).toHaveBeenCalledTimes(1);
  });
});
