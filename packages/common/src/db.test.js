const { validateMongoUri } = require('./db');

describe('db configuration validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MONGO_ALLOWED_DATABASES;
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('requires an explicit database name', () => {
    expect(() => validateMongoUri('mongodb://localhost:27017')).toThrow(/explicit database/);
  });

  test('rejects reserved test database names', () => {
    expect(() => validateMongoUri('mongodb://localhost:27017/test')).toThrow(/reserved/);
  });

  test('enforces an allow-list when configured', () => {
    process.env.MONGO_ALLOWED_DATABASES = 'PortfolioWeb,pulseroom_auth';

    expect(validateMongoUri('mongodb://localhost:27017/PortfolioWeb')).toBe('PortfolioWeb');
    expect(() => validateMongoUri('mongodb://localhost:27017/random_default')).toThrow(/MONGO_ALLOWED_DATABASES/);
  });
});
