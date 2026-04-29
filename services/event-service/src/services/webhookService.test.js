const { validateWebhookTargetUrl } = require('./webhookService');

describe('validateWebhookTargetUrl', () => {
  it('rejects local and private webhook targets', async () => {
    await expect(validateWebhookTargetUrl('http://localhost/webhook')).rejects.toMatchObject({
      code: 'webhook_target_blocked'
    });
    await expect(validateWebhookTargetUrl('http://127.0.0.1/webhook')).rejects.toMatchObject({
      code: 'webhook_target_blocked'
    });
    await expect(validateWebhookTargetUrl('http://10.1.2.3/webhook')).rejects.toMatchObject({
      code: 'webhook_target_blocked'
    });
    await expect(validateWebhookTargetUrl('http://[::1]/webhook')).rejects.toMatchObject({
      code: 'webhook_target_blocked'
    });
    await expect(validateWebhookTargetUrl('http://[::ffff:127.0.0.1]/webhook')).rejects.toMatchObject({
      code: 'webhook_target_blocked'
    });
  });

  it('rejects URLs with embedded credentials', async () => {
    await expect(validateWebhookTargetUrl('https://user:pass@example.com/webhook')).rejects.toMatchObject({
      code: 'webhook_target_invalid'
    });
  });

  it('allows public IP targets', async () => {
    await expect(validateWebhookTargetUrl('https://93.184.216.34/webhook')).resolves.toBe(
      'https://93.184.216.34/webhook'
    );
  });
});
