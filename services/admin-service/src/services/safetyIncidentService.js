const INCIDENT_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const INCIDENT_STATUSES = new Set(['open', 'reviewing', 'resolved']);

const normalizeIncidentSeverity = (value) =>
  INCIDENT_SEVERITIES.has(String(value || '').trim()) ? String(value).trim() : 'medium';

const normalizeIncidentStatus = (value) =>
  INCIDENT_STATUSES.has(String(value || '').trim()) ? String(value).trim() : 'open';

const serializeSafetyIncident = (incident = {}) => ({
  incidentId: incident._id?.toString?.() || incident.incidentId || '',
  incidentType: incident.incidentType || 'chat_message',
  category: incident.category || '',
  severity: normalizeIncidentSeverity(incident.severity),
  status: normalizeIncidentStatus(incident.status),
  sourceService: incident.sourceService || '',
  eventId: incident.eventId || '',
  organizerId: incident.organizerId || '',
  eventTitle: incident.eventTitle || '',
  targetId: incident.targetId || '',
  targetUserId: incident.targetUserId || '',
  summary: incident.summary || '',
  detail: incident.detail || '',
  riskScore: Number(incident.riskScore || 0),
  autoActions: Array.isArray(incident.autoActions) ? incident.autoActions : [],
  evidence: Array.isArray(incident.evidence) ? incident.evidence : [],
  metadata: incident.metadata || {},
  detectedAt: incident.detectedAt || incident.createdAt || null,
  resolutionNotes: incident.resolutionNotes || '',
  resolvedAt: incident.resolvedAt || null,
  resolvedBy: incident.resolvedBy || '',
  createdAt: incident.createdAt || null,
  updatedAt: incident.updatedAt || null
});

const buildSafetyIncidentSummary = (incidents = []) => {
  const summary = {
    total: 0,
    open: 0,
    reviewing: 0,
    resolved: 0,
    highOrCritical: 0,
    bySeverity: {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    },
    byIncidentType: {},
    byCategory: {},
    hiddenMessages: 0,
    bookingRisks: 0
  };

  for (const rawIncident of Array.isArray(incidents) ? incidents : []) {
    const incident = serializeSafetyIncident(rawIncident);
    summary.total += 1;
    summary[incident.status] += 1;
    summary.bySeverity[incident.severity] += 1;
    summary.byIncidentType[incident.incidentType] =
      (summary.byIncidentType[incident.incidentType] || 0) + 1;
    summary.byCategory[incident.category] = (summary.byCategory[incident.category] || 0) + 1;

    if (['high', 'critical'].includes(incident.severity)) {
      summary.highOrCritical += 1;
    }

    if (
      incident.incidentType === 'chat_message' &&
      incident.autoActions.some((item) => item === 'message_hidden')
    ) {
      summary.hiddenMessages += 1;
    }

    if (incident.incidentType === 'booking') {
      summary.bookingRisks += 1;
    }
  }

  return summary;
};

module.exports = {
  buildSafetyIncidentSummary,
  normalizeIncidentSeverity,
  normalizeIncidentStatus,
  serializeSafetyIncident
};
