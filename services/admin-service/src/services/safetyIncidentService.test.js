const {
  buildSafetyIncidentSummary,
  normalizeIncidentSeverity,
  normalizeIncidentStatus,
  serializeSafetyIncident
} = require('./safetyIncidentService');

describe('safetyIncidentService', () => {
  test('normalizeIncidentSeverity falls back safely', () => {
    expect(normalizeIncidentSeverity('critical')).toBe('critical');
    expect(normalizeIncidentSeverity('weird')).toBe('medium');
  });

  test('normalizeIncidentStatus falls back safely', () => {
    expect(normalizeIncidentStatus('resolved')).toBe('resolved');
    expect(normalizeIncidentStatus('broken')).toBe('open');
  });

  test('serializeSafetyIncident returns a frontend-friendly payload', () => {
    expect(
      serializeSafetyIncident({
        _id: { toString: () => 'incident-1' },
        incidentType: 'chat_message',
        severity: 'high',
        status: 'reviewing',
        summary: 'Hidden scam message',
        riskScore: 82,
        autoActions: ['message_hidden']
      })
    ).toMatchObject({
      incidentId: 'incident-1',
      incidentType: 'chat_message',
      severity: 'high',
      status: 'reviewing',
      summary: 'Hidden scam message',
      riskScore: 82,
      autoActions: ['message_hidden']
    });
  });

  test('buildSafetyIncidentSummary counts key safety metrics', () => {
    const summary = buildSafetyIncidentSummary([
      {
        incidentType: 'chat_message',
        category: 'scam',
        severity: 'high',
        status: 'open',
        autoActions: ['message_hidden']
      },
      {
        incidentType: 'booking',
        category: 'booking_risk',
        severity: 'medium',
        status: 'reviewing',
        autoActions: ['manual_review']
      },
      {
        incidentType: 'chat_message',
        category: 'spam',
        severity: 'low',
        status: 'resolved',
        autoActions: []
      }
    ]);

    expect(summary).toEqual({
      total: 3,
      open: 1,
      reviewing: 1,
      resolved: 1,
      highOrCritical: 1,
      bySeverity: {
        low: 1,
        medium: 1,
        high: 1,
        critical: 0
      },
      byIncidentType: {
        chat_message: 2,
        booking: 1
      },
      byCategory: {
        scam: 1,
        booking_risk: 1,
        spam: 1
      },
      hiddenMessages: 1,
      bookingRisks: 1
    });
  });
});
