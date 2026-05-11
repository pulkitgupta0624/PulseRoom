const { EventVisibility } = require('@pulseroom/common');
const { buildPublicEventFilters } = require('./publicEventFilters');

describe('buildPublicEventFilters', () => {
  test('includes organizerId when organizer profile pages request organizer-scoped events', () => {
    expect(
      buildPublicEventFilters(
        {
          organizerId: 'org_123',
          category: 'technology'
        },
        EventVisibility.PUBLIC
      )
    ).toMatchObject({
      status: 'published',
      visibility: EventVisibility.PUBLIC,
      organizerId: 'org_123',
      categories: 'technology'
    });
  });

  test('adds price bounds when provided', () => {
    expect(
      buildPublicEventFilters(
        {
          minPrice: '100',
          maxPrice: '250'
        },
        EventVisibility.PUBLIC
      )
    ).toMatchObject({
      ticketTiers: {
        $elemMatch: {
          price: {
            $gte: 100,
            $lte: 250
          }
        }
      }
    });
  });
});
