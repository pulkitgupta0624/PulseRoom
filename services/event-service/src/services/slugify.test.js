const { slugify } = require('./slugify');

describe('slugify', () => {
  it('creates lowercase URL-safe slugs', () => {
    expect(slugify('AI Summit 2026: Builders & Beyond')).toBe('ai-summit-2026-builders-beyond');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('  *** PulseRoom Live ***  ')).toBe('pulseroom-live');
  });
});

