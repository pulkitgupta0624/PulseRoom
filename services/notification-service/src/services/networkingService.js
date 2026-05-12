const normalizeInterestList = (values = []) =>
  [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean))];

const buildPairKey = (firstUserId, secondUserId) =>
  [firstUserId, secondUserId].sort().join(':');

const buildSharedInterests = (firstAttendee, secondAttendee) => {
  const firstInterests = new Set(normalizeInterestList(firstAttendee.interests));
  return normalizeInterestList(secondAttendee.interests).filter((interest) => firstInterests.has(interest));
};

const scoreMatch = (firstAttendee, secondAttendee) => {
  const sharedInterests = buildSharedInterests(firstAttendee, secondAttendee);
  const sameLocation =
    firstAttendee.location &&
    secondAttendee.location &&
    String(firstAttendee.location).trim().toLowerCase() === String(secondAttendee.location).trim().toLowerCase();
  const differentRoles =
    firstAttendee.role &&
    secondAttendee.role &&
    firstAttendee.role !== secondAttendee.role;

  return {
    sharedInterests,
    score:
      sharedInterests.length * 30 +
      (sameLocation ? 10 : 0) +
      (differentRoles ? 6 : 0)
  };
};

const buildMatchSummary = ({ firstAttendee, secondAttendee, sharedInterests }) => {
  const names = [firstAttendee.displayName, secondAttendee.displayName]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const sharedList = sharedInterests.slice(0, 3).join(', ');

  if (!sharedInterests.length) {
    return `${names[0] || 'This attendee'} and ${names[1] || 'their match'} should connect before the event.`;
  }

  return `${names[0] || 'This attendee'} and ${names[1] || 'their match'} both care about ${sharedList}.`;
};

const introResponseSchema = {
  type: 'object',
  required: ['summary', 'messages'],
  properties: {
    summary: { type: 'string' },
    messages: {
      type: 'array',
      items: {
        type: 'object',
        required: ['userId', 'message'],
        properties: {
          userId: { type: 'string' },
          message: { type: 'string' }
        }
      }
    }
  }
};

const callGeminiForIntro = async ({ config, match, eventTitle }) => {
  if (!config?.geminiApiKey) {
    return null;
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;

  const body = {
    system_instruction: {
      parts: [{
        text: [
          'You write concise, warm networking introductions for event attendees.',
          'Explain why the two people were matched using their interests, roles, and locations.',
          'Write one personalized message per participant, addressed to that participant.',
          'Do not invent private facts.'
        ].join(' ')
      }]
    },
    contents: [{
      role: 'user',
      parts: [{
        text: JSON.stringify({
          eventTitle,
          sharedInterests: match.sharedInterests,
          firstAttendee: match.firstAttendee,
          secondAttendee: match.secondAttendee
        })
      }]
    }],
    generationConfig: {
      temperature: 0.45,
      responseMimeType: 'application/json',
      responseSchema: introResponseSchema
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim());
  } catch {
    return null;
  }
};

const enrichMatchWithAiIntro = async ({ match, config, eventTitle, logger }) => {
  try {
    const aiIntro = await callGeminiForIntro({ config, match, eventTitle });
    if (!aiIntro) {
      return match;
    }

    const introMessages = {};
    for (const item of Array.isArray(aiIntro.messages) ? aiIntro.messages : []) {
      const userId = String(item.userId || '').trim();
      const message = String(item.message || '').trim();
      if (userId && message) {
        introMessages[userId] = message.slice(0, 900);
      }
    }

    return {
      ...match,
      summary: String(aiIntro.summary || match.summary).trim().slice(0, 500) || match.summary,
      introMessages
    };
  } catch (error) {
    logger?.warn?.({
      message: 'AI networking intro generation failed',
      pairKey: match.pairKey,
      error: error.message
    });
    return match;
  }
};

const enrichMatchesWithAiIntros = async ({ matches, config, eventTitle, logger }) => {
  if (!config?.geminiApiKey || !matches.length) {
    return matches;
  }

  const enriched = [];
  for (const match of matches) {
    enriched.push(await enrichMatchWithAiIntro({ match, config, eventTitle, logger }));
  }

  return enriched;
};

const generateNetworkingMatches = ({
  attendees,
  existingMatches = [],
  maxMatchesPerAttendee = 2
}) => {
  const safeAttendees = Array.isArray(attendees) ? attendees : [];
  if (safeAttendees.length < 2) {
    return [];
  }

  const counts = new Map();
  const existingPairKeys = new Set();

  for (const match of existingMatches) {
    existingPairKeys.add(match.pairKey);
    for (const participantUserId of match.participantUserIds || []) {
      counts.set(participantUserId, (counts.get(participantUserId) || 0) + 1);
    }
  }

  const rankedPairs = [];
  for (let index = 0; index < safeAttendees.length; index += 1) {
    for (let nestedIndex = index + 1; nestedIndex < safeAttendees.length; nestedIndex += 1) {
      const firstAttendee = safeAttendees[index];
      const secondAttendee = safeAttendees[nestedIndex];
      const pairKey = buildPairKey(firstAttendee.userId, secondAttendee.userId);

      if (existingPairKeys.has(pairKey)) {
        continue;
      }

      const { sharedInterests, score } = scoreMatch(firstAttendee, secondAttendee);
      if (!sharedInterests.length) {
        continue;
      }

      rankedPairs.push({
        pairKey,
        participantUserIds: [firstAttendee.userId, secondAttendee.userId].sort(),
        firstAttendee,
        secondAttendee,
        sharedInterests,
        score,
        summary: buildMatchSummary({
          firstAttendee,
          secondAttendee,
          sharedInterests
        })
      });
    }
  }

  rankedPairs.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.pairKey.localeCompare(right.pairKey);
  });

  const createdMatches = [];
  for (const pair of rankedPairs) {
    const firstCount = counts.get(pair.firstAttendee.userId) || 0;
    const secondCount = counts.get(pair.secondAttendee.userId) || 0;
    if (firstCount >= maxMatchesPerAttendee || secondCount >= maxMatchesPerAttendee) {
      continue;
    }

    counts.set(pair.firstAttendee.userId, firstCount + 1);
    counts.set(pair.secondAttendee.userId, secondCount + 1);
    createdMatches.push(pair);
  }

  return createdMatches;
};

module.exports = {
  buildPairKey,
  buildSharedInterests,
  buildMatchSummary,
  enrichMatchesWithAiIntros,
  generateNetworkingMatches,
  normalizeInterestList,
  scoreMatch
};
