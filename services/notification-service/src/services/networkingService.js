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
  generateNetworkingMatches,
  normalizeInterestList,
  scoreMatch
};
