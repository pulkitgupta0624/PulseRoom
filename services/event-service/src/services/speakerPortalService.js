const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const normalizeString = (value) => String(value || '').trim();

const hasMatchingUser = ({ candidateUserId = '', candidateEmail = '' }, user = {}) => {
  if (candidateUserId && candidateUserId === user.sub) {
    return true;
  }

  const normalizedCandidateEmail = normalizeEmail(candidateEmail);
  const normalizedUserEmail = normalizeEmail(user.email);
  return Boolean(normalizedCandidateEmail && normalizedUserEmail && normalizedCandidateEmail === normalizedUserEmail);
};

const getAssignedSpeakerProfile = (event = {}, user = {}) =>
  (event.speakers || []).find((speaker) =>
    hasMatchingUser(
      {
        candidateUserId: speaker.userId,
        candidateEmail: speaker.email
      },
      user
    )
  ) || null;

const getAssignedTeamMembers = (event = {}, user = {}) =>
  (event.teamMembers || []).filter((member) =>
    hasMatchingUser(
      {
        candidateUserId: member.userId,
        candidateEmail: member.email
      },
      user
    )
  );

const buildAssignedSessions = (event = {}, speakerProfile = null) => {
  if (!speakerProfile?.name) {
    return [];
  }

  const speakerName = normalizeString(speakerProfile.name).toLowerCase();
  return (event.sessions || []).filter((session) =>
    (session.speakerNames || []).some(
      (speakerNameValue) => normalizeString(speakerNameValue).toLowerCase() === speakerName
    )
  );
};

const buildSpeakerPortalEntry = (event = {}, user = {}) => {
  const speakerProfile = getAssignedSpeakerProfile(event, user);
  const teamMembers = getAssignedTeamMembers(event, user);

  if (!speakerProfile && !teamMembers.length) {
    return null;
  }

  const assignedSessions = buildAssignedSessions(event, speakerProfile);
  const teamRoles = [...new Set(teamMembers.map((member) => normalizeString(member.role)).filter(Boolean))];
  const assignmentRoles = speakerProfile ? ['speaker', ...teamRoles] : teamRoles;

  return {
    eventId: event._id?.toString?.() || event.eventId || '',
    title: event.title || 'Event',
    summary: event.summary || '',
    startsAt: event.startsAt || null,
    endsAt: event.endsAt || null,
    status: event.status || 'draft',
    type: event.type || 'online',
    venueName: event.venueName || '',
    city: event.city || '',
    country: event.country || '',
    coverImageUrl: event.coverImageUrl || '',
    organizerId: event.organizerId || '',
    assignmentRoles,
    speakerProfile: speakerProfile
      ? {
          userId: speakerProfile.userId || '',
          email: speakerProfile.email || '',
          name: speakerProfile.name || '',
          title: speakerProfile.title || '',
          company: speakerProfile.company || '',
          bio: speakerProfile.bio || '',
          avatarUrl: speakerProfile.avatarUrl || ''
        }
      : null,
    teamMembers: teamMembers.map((member) => ({
      userId: member.userId || '',
      email: member.email || '',
      name: member.name || '',
      role: member.role || '',
      notes: member.notes || ''
    })),
    sessions: assignedSessions.map((session) => ({
      title: session.title || '',
      description: session.description || '',
      startsAt: session.startsAt || null,
      endsAt: session.endsAt || null,
      roomLabel: session.roomLabel || '',
      speakerNames: session.speakerNames || []
    }))
  };
};

module.exports = {
  buildAssignedSessions,
  buildSpeakerPortalEntry,
  getAssignedSpeakerProfile,
  getAssignedTeamMembers,
  hasMatchingUser,
  normalizeEmail
};
