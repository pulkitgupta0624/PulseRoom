let Typesense = null;
try {
  Typesense = require('typesense');
} catch (_error) {
  Typesense = null;
}

const SEARCH_QUERY_FIELDS = [
  'title',
  'summary',
  'description',
  'categories',
  'tags',
  'city',
  'venueName',
  'ticketTierNames'
];

const facetArrayToMap = (facetCounts = []) =>
  facetCounts.reduce((accumulator, facet) => {
    accumulator[facet.field_name] = (facet.counts || []).map((item) => ({
      value: item.value,
      count: item.count
    }));
    return accumulator;
  }, {});

const quoteFilterValue = (value) => `\`${String(value).replace(/`/g, '\\`')}\``;

const buildPriceSummary = (ticketTiers = []) => {
  if (!ticketTiers.length) {
    return {
      lowestPrice: 0,
      lowestPriceCurrency: 'INR',
      isFree: true,
      ticketTierNames: []
    };
  }

  const sorted = [...ticketTiers].sort((left, right) => left.price - right.price);
  return {
    lowestPrice: Number(sorted[0]?.price || 0),
    lowestPriceCurrency: sorted[0]?.currency || 'INR',
    isFree: Number(sorted[0]?.price || 0) === 0,
    ticketTierNames: sorted.map((tier) => tier.name).filter(Boolean)
  };
};

const buildEventSearchDocument = (event) => {
  const startsAt = new Date(event.startsAt);
  const endsAt = new Date(event.endsAt || event.startsAt);
  const priceSummary = buildPriceSummary(event.ticketTiers || []);

  return {
    id: event._id.toString(),
    eventId: event._id.toString(),
    organizerId: event.organizerId,
    slug: event.slug,
    title: event.title,
    summary: event.summary || '',
    description: event.description || '',
    coverImageUrl: event.coverImageUrl || '',
    type: event.type,
    visibility: event.visibility,
    status: event.status,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    startsAtTimestamp: Math.floor(startsAt.getTime() / 1000),
    endsAtTimestamp: Math.floor(endsAt.getTime() / 1000),
    venueName: event.venueName || '',
    venueAddress: event.venueAddress || '',
    city: event.city || '',
    country: event.country || '',
    categories: event.categories || [],
    tags: event.tags || [],
    attendeesCount: Number(event.attendeesCount || 0),
    lowestPrice: priceSummary.lowestPrice,
    lowestPriceCurrency: priceSummary.lowestPriceCurrency,
    isFree: priceSummary.isFree,
    ticketTierNames: priceSummary.ticketTierNames
  };
};

class EventSearchService {
  constructor({ config, logger }) {
    this.collectionName = config.typesenseCollection;
    this.logger = logger;
    this.enabled = Boolean(Typesense);

    if (!this.enabled) {
      this.client = null;
      return;
    }

    this.client = new Typesense.Client({
      nodes: [
        {
          host: config.typesenseHost,
          port: config.typesensePort,
          protocol: config.typesenseProtocol
        }
      ],
      apiKey: config.typesenseApiKey,
      connectionTimeoutSeconds: 2
    });
  }

  isEnabled() {
    return Boolean(this.client);
  }

  async ensureCollection() {
    if (!this.client) {
      return false;
    }

    try {
      await this.client.collections(this.collectionName).retrieve();
      return true;
    } catch (_error) {
      try {
        await this.client.collections().create({
          name: this.collectionName,
          enable_nested_fields: false,
          default_sorting_field: 'startsAtTimestamp',
          fields: [
            { name: 'eventId', type: 'string' },
            { name: 'organizerId', type: 'string', optional: true },
            { name: 'slug', type: 'string', optional: true },
            { name: 'title', type: 'string' },
            { name: 'summary', type: 'string', optional: true },
            { name: 'description', type: 'string', optional: true },
            { name: 'coverImageUrl', type: 'string', optional: true },
            { name: 'type', type: 'string', facet: true },
            { name: 'visibility', type: 'string', facet: true },
            { name: 'status', type: 'string', facet: true },
            { name: 'startsAt', type: 'string' },
            { name: 'endsAt', type: 'string' },
            { name: 'startsAtTimestamp', type: 'int64' },
            { name: 'endsAtTimestamp', type: 'int64' },
            { name: 'venueName', type: 'string', optional: true },
            { name: 'venueAddress', type: 'string', optional: true },
            { name: 'city', type: 'string', facet: true, optional: true },
            { name: 'country', type: 'string', optional: true },
            { name: 'categories', type: 'string[]', facet: true, optional: true },
            { name: 'tags', type: 'string[]', optional: true },
            { name: 'attendeesCount', type: 'int32' },
            { name: 'lowestPrice', type: 'float' },
            { name: 'lowestPriceCurrency', type: 'string', optional: true },
            { name: 'isFree', type: 'bool', facet: true },
            { name: 'ticketTierNames', type: 'string[]', optional: true }
          ]
        });
        return true;
      } catch (createError) {
        this.logger.warn({
          message: 'Typesense collection unavailable, using MongoDB search fallback',
          error: createError.message
        });
        this.client = null;
        return false;
      }
    }
  }

  async upsertEvent(event) {
    if (!this.client) {
      return;
    }

    await this.client
      .collections(this.collectionName)
      .documents()
      .upsert(buildEventSearchDocument(event));
  }

  async deleteEvent(eventId) {
    if (!this.client) {
      return;
    }

    try {
      await this.client.collections(this.collectionName).documents(eventId).delete();
    } catch (error) {
      if (error?.httpStatus !== 404) {
        throw error;
      }
    }
  }

  async reindexEvents(events) {
    if (!this.client) {
      return;
    }

    for (const event of events) {
      await this.upsertEvent(event);
    }
  }

  async searchEvents(params = {}) {
    if (!this.client) {
      throw new Error('typesense_unavailable');
    }

    const filters = [];
    const limit = Math.min(Math.max(Number(params.limit || 20), 1), 100);
    const page = Math.max(Number(params.page || 1), 1);
    const query = params.q?.trim() ? params.q.trim() : '*';

    if (params.status) {
      filters.push(`status:=${quoteFilterValue(params.status)}`);
    }

    if (params.visibility) {
      filters.push(`visibility:=${quoteFilterValue(params.visibility)}`);
    }

    if (params.type) {
      filters.push(`type:=${quoteFilterValue(params.type)}`);
    }

    if (params.category) {
      filters.push(`categories:=[${quoteFilterValue(params.category)}]`);
    }

    if (params.city) {
      filters.push(`city:=${quoteFilterValue(params.city)}`);
    }

    // ── NEW: filter by organizer ──────────────────────────────────────────────
    if (params.organizerId) {
      filters.push(`organizerId:=${quoteFilterValue(params.organizerId)}`);
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (params.minPrice) {
      filters.push(`lowestPrice:>=${Number(params.minPrice)}`);
    }

    if (params.maxPrice) {
      filters.push(`lowestPrice:<=${Number(params.maxPrice)}`);
    }

    if (params.startsAfter) {
      filters.push(
        `startsAtTimestamp:>=${Math.floor(new Date(params.startsAfter).getTime() / 1000)}`
      );
    }

    if (params.startsBefore) {
      filters.push(
        `startsAtTimestamp:<=${Math.floor(new Date(params.startsBefore).getTime() / 1000)}`
      );
    }

    const response = await this.client
      .collections(this.collectionName)
      .documents()
      .search({
        q: query,
        query_by: SEARCH_QUERY_FIELDS.join(','),
        filter_by: filters.join(' && ') || undefined,
        sort_by:
          params.sort === 'popular'
            ? 'attendeesCount:desc,startsAtTimestamp:asc'
            : 'startsAtTimestamp:asc',
        page,
        per_page: limit,
        facet_by: 'categories,city,type',
        max_facet_values: 10,
        num_typos: 2,
        exhaustive_search: true
      });

    return {
      items: (response.hits || []).map((hit) => ({
        _id: hit.document.eventId,
        organizerId: hit.document.organizerId,
        title: hit.document.title,
        summary: hit.document.summary,
        coverImageUrl: hit.document.coverImageUrl,
        type: hit.document.type,
        visibility: hit.document.visibility,
        status: hit.document.status,
        startsAt: hit.document.startsAt,
        endsAt: hit.document.endsAt,
        venueName: hit.document.venueName,
        city: hit.document.city,
        country: hit.document.country,
        categories: hit.document.categories || [],
        tags: hit.document.tags || [],
        attendeesCount: hit.document.attendeesCount,
        lowestPrice: hit.document.lowestPrice,
        lowestPriceCurrency: hit.document.lowestPriceCurrency,
        isFree: hit.document.isFree
      })),
      facets: facetArrayToMap(response.facet_counts),
      meta: {
        found: response.found || 0,
        page,
        perPage: limit,
        engine: 'typesense'
      }
    };
  }
}

module.exports = {
  EventSearchService,
  buildEventSearchDocument,
  buildPriceSummary
};