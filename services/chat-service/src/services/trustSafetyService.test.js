const {
  analyzeChatMessage,
  getSlowModeRetryMs,
  isPrivilegedChatRole,
  normalizeSlowModeSeconds
} = require('./trustSafetyService');

describe('trustSafetyService', () => {
  test('normalizeSlowModeSeconds clamps values to the supported range', () => {
    expect(normalizeSlowModeSeconds(-5)).toBe(0);
    expect(normalizeSlowModeSeconds(12.4)).toBe(12);
    expect(normalizeSlowModeSeconds(200)).toBe(60);
  });

  test('isPrivilegedChatRole exempts organizers and moderators from slow mode', () => {
    expect(isPrivilegedChatRole('organizer')).toBe(true);
    expect(isPrivilegedChatRole('moderator')).toBe(true);
    expect(isPrivilegedChatRole('attendee')).toBe(false);
  });

  test('getSlowModeRetryMs computes the remaining cooldown window', () => {
    expect(
      getSlowModeRetryMs({
        lastMessageAt: '2026-05-14T10:00:00.000Z',
        slowModeSeconds: 20,
        now: new Date('2026-05-14T10:00:12.000Z').getTime()
      })
    ).toBe(8000);
  });

  test('analyzeChatMessage hides high-risk scammy spam', () => {
    const analysis = analyzeChatMessage(
      'WHATSAPP ME NOW for guaranteed returns https://bad.site https://bad2.site'
    );

    expect(analysis.visibilityAction).toBe('hidden');
    expect(analysis.shouldCreateIncident).toBe(true);
    expect(analysis.category).toBe('scam');
    expect(analysis.evidence).toEqual(
      expect.arrayContaining([
        expect.stringContaining('outbound links'),
        expect.stringContaining('Suspicious phrase detected')
      ])
    );
  });

  test('analyzeChatMessage flags medium-risk abusive content', () => {
    const analysis = analyzeChatMessage('You are such an idiot, shut up already.');

    expect(analysis.visibilityAction).toBe('flagged');
    expect(analysis.category).toBe('abuse');
    expect(analysis.riskScore).toBeGreaterThanOrEqual(40);
  });

  test('analyzeChatMessage allows healthy conversation', () => {
    const analysis = analyzeChatMessage('Would love to compare session notes after the talk.');

    expect(analysis).toMatchObject({
      visibilityAction: 'allow',
      shouldCreateIncident: false,
      severity: 'low'
    });
  });
});
