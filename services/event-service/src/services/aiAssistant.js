/**
 * aiAssistant.js
 *
 * Replaces the OpenAI integration with Google Gemini's REST API.
 *
 * Key differences from OpenAI:
 *  - Endpoint: generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *  - Auth:     ?key=GEMINI_API_KEY  (query param, not Bearer header)
 *  - System:   top-level "system_instruction" object, not a messages[] entry
 *  - Messages: contents[{ role: "user"|"model", parts: [{ text }] }]
 *  - JSON out: generationConfig.responseMimeType = "application/json"
 *              generationConfig.responseSchema   = <OpenAPI-subset schema>
 *
 * The responseSchema format Gemini accepts is very similar to JSON Schema but:
 *  - No "additionalProperties" key (silently ignored or causes 400)
 *  - Types are lowercase strings: "string", "number", "integer", "boolean",
 *    "object", "array"
 *  - "enum" arrays work the same way
 */

const crypto = require('crypto');
const { AppError } = require('@pulseroom/common');
const config = require('../config');

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_CURRENCY = 'INR';

const defaultSchedule = () => {
  const start = new Date();
  start.setDate(start.getDate() + 14);
  start.setHours(18, 0, 0, 0);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  return { start, end };
};

const ensureIsoDate = (value, fallback) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback.toISOString();
  return parsed.toISOString();
};

// ── Gemini API call ───────────────────────────────────────────────────────────

/**
 * Calls the Gemini generateContent endpoint and returns parsed JSON that
 * conforms to the supplied responseSchema.
 *
 * @param {object} opts
 * @param {string}   opts.systemPrompt  - System instruction text
 * @param {string}   opts.userPrompt    - User turn text
 * @param {object}   opts.responseSchema - OpenAPI-subset schema for JSON output
 * @param {number}   [opts.temperature=0.5]
 */
const callGemini = async ({ systemPrompt, userPrompt, responseSchema, temperature = 0.5 }) => {
  if (!config.geminiApiKey) {
    throw new AppError(
      'AI assistant is not configured. Add GEMINI_API_KEY to your .env to enable this feature.',
      503,
      'ai_not_configured'
    );
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;

  const body = {
    system_instruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }]
      }
    ],
    generationConfig: {
      temperature,
      responseMimeType: 'application/json',
      responseSchema
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new AppError(
      `Gemini API request failed (${response.status})`,
      502,
      'ai_upstream_error',
      [details.slice(0, 400)]
    );
  }

  const payload = await response.json();

  // Gemini wraps the output in candidates[0].content.parts[0].text
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new AppError('Gemini returned an empty response', 502, 'ai_empty_response');
  }

  // Because we set responseMimeType = "application/json", the text IS valid
  // JSON already — but strip any accidental markdown fences just in case.
  const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

  try {
    return JSON.parse(clean);
  } catch {
    throw new AppError('Gemini returned malformed JSON', 502, 'ai_parse_error');
  }
};

// ── Schema helpers ────────────────────────────────────────────────────────────

const normalizeStringArray = (value, fallback = []) => {
  if (!Array.isArray(value)) return fallback;
  return value.map((item) => String(item || '').trim()).filter(Boolean);
};

const normalizeTierId = (value, fallback) =>
  String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;

const normalizeTicketTiers = (tiers) => {
  const safeTiers =
    Array.isArray(tiers) && tiers.length
      ? tiers
      : [{ name: 'General Admission', description: 'Main access tier', price: 0, quantity: 50, perks: ['Event access'], isFree: true }];

  return safeTiers.slice(0, 4).map((tier, index) => {
    const price = Number(tier.price || 0);
    const quantity = Math.max(1, Number(tier.quantity || 50));
    const name = String(tier.name || `Tier ${index + 1}`).trim();
    return {
      tierId: normalizeTierId(tier.tierId, `tier-${index + 1}`),
      name,
      description: String(tier.description || '').trim(),
      price,
      currency: String(tier.currency || DEFAULT_CURRENCY).trim() || DEFAULT_CURRENCY,
      quantity,
      perks: normalizeStringArray(tier.perks),
      isFree: Boolean(tier.isFree ?? price === 0)
    };
  });
};

const normalizeSpeakers = (speakers) =>
  (Array.isArray(speakers) ? speakers : [])
    .slice(0, 6)
    .map((s) => ({
      name: String(s.name || '').trim(),
      title: String(s.title || '').trim(),
      company: String(s.company || '').trim(),
      bio: String(s.bio || '').trim()
    }))
    .filter((s) => s.name);

const normalizeSessions = (sessions, startsAt, endsAt, speakerNames) => {
  const safeSessions =
    Array.isArray(sessions) && sessions.length
      ? sessions
      : [{ title: 'Opening Session', description: 'Kickoff and welcome', startsAt, endsAt, roomLabel: 'Main stage', speakerNames }];

  return safeSessions.slice(0, 8).map((s, index) => ({
    title: String(s.title || `Session ${index + 1}`).trim(),
    description: String(s.description || '').trim(),
    startsAt: ensureIsoDate(s.startsAt, new Date(startsAt)),
    endsAt: ensureIsoDate(s.endsAt, new Date(endsAt)),
    roomLabel: String(s.roomLabel || '').trim(),
    speakerNames: normalizeStringArray(s.speakerNames)
  }));
};

// ── Gemini response schemas ───────────────────────────────────────────────────
//
// NOTE: Gemini's responseSchema is an OpenAPI-subset.
//  ✅ type, properties, required, items, enum, description
//  ❌ additionalProperties (not supported — omit it)

const eventDraftResponseSchema = {
  type: 'object',
  required: [
    'title', 'summary', 'description', 'type', 'visibility', 'timezone',
    'startsAt', 'endsAt', 'venueName', 'city', 'country',
    'categories', 'tags', 'coverImagePrompt',
    'ticketTiers', 'speakers', 'sessions',
    'assumptions', 'suggestedFaq'
  ],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    description: { type: 'string' },
    type: { type: 'string', enum: ['online', 'offline', 'hybrid'] },
    visibility: { type: 'string', enum: ['public', 'private'] },
    timezone: { type: 'string' },
    startsAt: { type: 'string' },
    endsAt: { type: 'string' },
    venueName: { type: 'string' },
    city: { type: 'string' },
    country: { type: 'string' },
    categories: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },
    coverImagePrompt: { type: 'string' },
    ticketTiers: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'description', 'price', 'currency', 'quantity', 'perks', 'isFree'],
        properties: {
          tierId: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          price: { type: 'number' },
          currency: { type: 'string' },
          quantity: { type: 'number' },
          perks: { type: 'array', items: { type: 'string' } },
          isFree: { type: 'boolean' }
        }
      }
    },
    speakers: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'title', 'company', 'bio'],
        properties: {
          name: { type: 'string' },
          title: { type: 'string' },
          company: { type: 'string' },
          bio: { type: 'string' }
        }
      }
    },
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'description', 'startsAt', 'endsAt', 'roomLabel', 'speakerNames'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          startsAt: { type: 'string' },
          endsAt: { type: 'string' },
          roomLabel: { type: 'string' },
          speakerNames: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    assumptions: { type: 'array', items: { type: 'string' } },
    suggestedFaq: { type: 'array', items: { type: 'string' } }
  }
};

const answerResponseSchema = {
  type: 'object',
  required: ['answer', 'confidence', 'supportingPoints'],
  properties: {
    answer: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    supportingPoints: { type: 'array', items: { type: 'string' } }
  }
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generates a full event draft from a loose organizer idea string.
 */
const generateEventDraft = async ({ idea, userId: _userId }) => {
  const { start, end } = defaultSchedule();

  const systemPrompt = [
    'You are PulseRoom\'s AI Event Assistant.',
    'Turn rough organizer ideas into production-ready event drafts.',
    'Use Indian market assumptions unless the organizer specifies otherwise.',
    `If timing is missing, default to start: ${start.toISOString()} and end: ${end.toISOString()}.`,
    'Ticket tiers should be commercially sensible for the audience size.',
    'Cover image prompts should be vivid and specific enough for a designer or image model.',
    'Return ONLY valid JSON matching the requested schema — no markdown, no commentary.'
  ].join(' ');

  const userPrompt = `Organizer idea: ${idea}`;

  const draft = await callGemini({
    systemPrompt,
    userPrompt,
    responseSchema: eventDraftResponseSchema,
    temperature: 0.7
  });

  const startsAt = ensureIsoDate(draft.startsAt, start);
  const endsAt = ensureIsoDate(draft.endsAt, end);
  const speakers = normalizeSpeakers(draft.speakers);
  const speakerNames = speakers.map((s) => s.name);

  return {
    title: String(draft.title || '').trim(),
    summary: String(draft.summary || '').trim(),
    description: String(draft.description || '').trim(),
    type: ['online', 'offline', 'hybrid'].includes(draft.type) ? draft.type : 'online',
    visibility: ['public', 'private'].includes(draft.visibility) ? draft.visibility : 'public',
    timezone: String(draft.timezone || 'Asia/Calcutta').trim() || 'Asia/Calcutta',
    startsAt,
    endsAt:
      new Date(endsAt) > new Date(startsAt)
        ? endsAt
        : new Date(new Date(startsAt).getTime() + 3 * 60 * 60 * 1000).toISOString(),
    venueName: String(draft.venueName || '').trim(),
    city: String(draft.city || '').trim(),
    country: String(draft.country || '').trim(),
    categories: normalizeStringArray(draft.categories, ['technology']).slice(0, 3),
    tags: normalizeStringArray(draft.tags).slice(0, 8),
    coverImagePrompt: String(draft.coverImagePrompt || '').trim(),
    ticketTiers: normalizeTicketTiers(draft.ticketTiers),
    speakers,
    sessions: normalizeSessions(draft.sessions, startsAt, endsAt, speakerNames),
    assumptions: normalizeStringArray(draft.assumptions).slice(0, 6),
    suggestedFaq: normalizeStringArray(draft.suggestedFaq).slice(0, 6)
  };
};

/**
 * Answers an attendee question about a specific event using only event data.
 */
const answerEventQuestion = async ({ event, question, userId: _userId }) => {
  const systemPrompt = [
    'You are PulseRoom\'s attendee-facing event assistant.',
    'Answer only from the supplied event details.',
    'If the answer is not present in the event details, say so clearly — do not guess.',
    'Keep responses concise and practical for attendees.',
    'Return ONLY valid JSON matching the requested schema — no markdown, no commentary.'
  ].join(' ');

  const userPrompt =
    `Event details:\n${JSON.stringify(
      {
        title: event.title,
        summary: event.summary,
        description: event.description,
        type: event.type,
        venueName: event.venueName,
        city: event.city,
        country: event.country,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        ticketTiers: event.ticketTiers,
        speakers: event.speakers,
        sessions: event.sessions,
        tags: event.tags
      },
      null,
      2
    )}\n\nAttendee question: ${question}`;

  const result = await callGemini({
    systemPrompt,
    userPrompt,
    responseSchema: answerResponseSchema,
    temperature: 0.2
  });

  return {
    answer: String(result.answer || '').trim(),
    confidence: result.confidence || 'medium',
    supportingPoints: normalizeStringArray(result.supportingPoints).slice(0, 4)
  };
};

module.exports = {
  generateEventDraft,
  answerEventQuestion
};