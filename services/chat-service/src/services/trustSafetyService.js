const SUSPICIOUS_PHRASES = [
  'whatsapp me',
  'telegram me',
  'guaranteed returns',
  'double your money',
  'dm for investment',
  'crypto signal',
  'forex signal',
  'send payment',
  'urgent transfer',
  'contact me privately'
];

const ABUSIVE_TERMS = [
  'idiot',
  'stupid',
  'moron',
  'scammer',
  'loser',
  'shut up'
];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const normalizeSlowModeSeconds = (value) => clamp(Math.round(Number(value || 0)), 0, 60);

const isPrivilegedChatRole = (role) =>
  ['organizer', 'moderator', 'admin'].includes(String(role || '').trim().toLowerCase());

const getSlowModeRetryMs = ({ lastMessageAt, slowModeSeconds, now = Date.now() }) => {
  const normalizedSlowMode = normalizeSlowModeSeconds(slowModeSeconds);
  if (!normalizedSlowMode || !lastMessageAt) {
    return 0;
  }

  const previousAt = new Date(lastMessageAt).getTime();
  if (!Number.isFinite(previousAt)) {
    return 0;
  }

  const nextAllowedAt = previousAt + normalizedSlowMode * 1000;
  return Math.max(nextAllowedAt - now, 0);
};

const countUrls = (text) => (String(text || '').match(/https?:\/\/\S+/gi) || []).length;

const countRepeatedWordPattern = (text) => {
  const matches = String(text || '').toLowerCase().match(/\b(\w+)\b(?:\s+\1\b){2,}/g);
  return matches ? matches.length : 0;
};

const computeUppercaseRatio = (text) => {
  const letters = String(text || '').replace(/[^a-z]/gi, '');
  if (!letters.length) {
    return 0;
  }

  const uppercaseLetters = letters.replace(/[^A-Z]/g, '');
  return uppercaseLetters.length / letters.length;
};

const categorizeSeverity = (riskScore) => {
  if (riskScore >= 90) {
    return 'critical';
  }
  if (riskScore >= 70) {
    return 'high';
  }
  if (riskScore >= 40) {
    return 'medium';
  }
  return 'low';
};

const analyzeChatMessage = (body = '') => {
  const rawBody = String(body || '').trim();
  const normalizedBody = rawBody.toLowerCase();
  const evidence = [];
  const categories = new Set();
  let riskScore = 0;

  const urlCount = countUrls(rawBody);
  if (urlCount >= 2) {
    categories.add('spam');
    evidence.push(`Message includes ${urlCount} outbound links`);
    riskScore += 25;
  }

  if (computeUppercaseRatio(rawBody) >= 0.55 && rawBody.length >= 20) {
    categories.add('abuse');
    evidence.push('Message uses excessive all-caps emphasis');
    riskScore += 10;
  }

  const repeatedPatternCount = countRepeatedWordPattern(rawBody);
  if (repeatedPatternCount > 0) {
    categories.add('spam');
    evidence.push('Message repeats the same word pattern multiple times');
    riskScore += 20;
  }

  for (const phrase of SUSPICIOUS_PHRASES) {
    if (normalizedBody.includes(phrase)) {
      categories.add('scam');
      evidence.push(`Suspicious phrase detected: "${phrase}"`);
      riskScore += 30;
    }
  }

  for (const term of ABUSIVE_TERMS) {
    if (normalizedBody.includes(term)) {
      categories.add('abuse');
      evidence.push(`Abusive term detected: "${term}"`);
      riskScore += 22;
    }
  }

  if (/(.)\1{7,}/.test(rawBody)) {
    categories.add('spam');
    evidence.push('Message contains excessive repeated characters');
    riskScore += 10;
  }

  const severity = categorizeSeverity(riskScore);
  const visibilityAction = severity === 'high' || severity === 'critical'
    ? 'hidden'
    : severity === 'medium'
      ? 'flagged'
      : 'allow';
  const category =
    categories.has('scam')
      ? 'scam'
      : categories.has('abuse')
        ? 'abuse'
        : categories.has('spam')
          ? 'spam'
          : 'general';

  const autoActions = [];
  if (visibilityAction === 'hidden') {
    autoActions.push('message_hidden');
  } else if (visibilityAction === 'flagged') {
    autoActions.push('manual_review');
  }

  return {
    category,
    severity,
    riskScore,
    evidence,
    visibilityAction,
    autoActions,
    shouldCreateIncident: visibilityAction !== 'allow'
  };
};

module.exports = {
  analyzeChatMessage,
  getSlowModeRetryMs,
  isPrivilegedChatRole,
  normalizeSlowModeSeconds
};
