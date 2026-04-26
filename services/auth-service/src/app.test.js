const request = require('supertest');
const { createApp } = require('./app');

describe('auth service', () => {
  const app = createApp({
    eventBus: {
      publish: jest.fn()
    }
  });

  it('responds to health checks', async () => {
    const response = await request(app).get('/health');
    expect(response.statusCode).toBe(200);
    expect(response.body.service).toBe('auth-service');
  });

  it('rejects invalid registration payloads before touching persistence', async () => {
    const response = await request(app).post('/api/auth/register').send({
      email: 'invalid-email',
      password: 'short'
    });

    expect(response.statusCode).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });
});

