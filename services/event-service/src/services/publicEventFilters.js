const { EventVisibility } = require('@pulseroom/common');

const buildPublicEventFilters = (query = {}, visibility = EventVisibility.PUBLIC) => {
  const filters = {
    status: 'published',
    visibility
  };

  if (query.organizerId) {
    filters.organizerId = query.organizerId;
  }
  if (query.type) {
    filters.type = query.type;
  }
  if (query.category) {
    filters.categories = query.category;
  }
  if (query.tag) {
    filters.tags = query.tag;
  }
  if (query.city) {
    filters.city = new RegExp(`^${query.city}$`, 'i');
  }
  if (query.startsAfter || query.startsBefore) {
    filters.startsAt = {};
    if (query.startsAfter) {
      filters.startsAt.$gte = new Date(query.startsAfter);
    }
    if (query.startsBefore) {
      filters.startsAt.$lte = new Date(query.startsBefore);
    }
  }
  if (query.q) {
    filters.$text = { $search: query.q };
  }
  if (query.minPrice || query.maxPrice) {
    filters.ticketTiers = {
      $elemMatch: {
        price: {
          ...(query.minPrice ? { $gte: Number(query.minPrice) } : {}),
          ...(query.maxPrice ? { $lte: Number(query.maxPrice) } : {})
        }
      }
    };
  }

  return filters;
};

module.exports = {
  buildPublicEventFilters
};
