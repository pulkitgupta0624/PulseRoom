const crypto = require('crypto');

const SESSION_MANAGE_ROLES = new Set(['moderator', 'producer']);
const BRIEFING_OWNERS = new Set(['organizer', 'speaker', 'moderator', 'producer']);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const normalizeString = (value) => String(value || '').trim();

const normalizeStringArray = (values = []) =>
  [...new Set((Array.isArray(values) ? values : []).map((value) => normalizeString(value)).filter(Boolean))];

const buildGeneratedId = (prefix) => `${prefix}_${crypto.randomBytes(4).toString('hex')}`;

const buildDerivedSessionId = (session = {}) =>
  `sess_${crypto
    .createHash('sha1')
    .update(
      [
        normalizeString(session.title).toLowerCase(),
        session.startsAt ? new Date(session.startsAt).toISOString() : '',
        session.endsAt ? new Date(session.endsAt).toISOString() : ''
      ].join('|')
    )
    .digest('hex')
    .slice(0, 12)}`;

const buildSessionLookupKey = (session = {}) => {
  if (session.sessionId) {
    return `id:${session.sessionId}`;
  }

  return `derived:${buildDerivedSessionId(session)}`;
};

const serializeSpeakerResource = (resource = {}) => ({
  resourceId: resource.resourceId || buildGeneratedId('res'),
  label: normalizeString(resource.label),
  url: normalizeString(resource.url),
  type: normalizeString(resource.type) || 'resource'
});

const normalizeSpeakerResources = (resources = [], existingResources = []) => {
  const existingById = new Map(
    (Array.isArray(existingResources) ? existingResources : [])
      .map((resource) => serializeSpeakerResource(resource))
      .map((resource) => [resource.resourceId, resource])
  );
  const seen = new Set();

  return (Array.isArray(resources) ? resources : [])
    .map((resource) => {
      const existing = resource?.resourceId ? existingById.get(resource.resourceId) : null;
      return serializeSpeakerResource({
        ...existing,
        ...resource,
        resourceId: resource?.resourceId || existing?.resourceId || buildGeneratedId('res')
      });
    })
    .filter((resource) => resource.label && resource.url)
    .filter((resource) => {
      const key = `${resource.label.toLowerCase()}|${resource.url.toLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
};

const serializeChecklistItem = (item = {}) => ({
  itemId: item.itemId || buildGeneratedId('chk'),
  label: normalizeString(item.label),
  completed: Boolean(item.completed)
});

const normalizeChecklistItems = (items = [], existingItems = []) => {
  const existingById = new Map(
    (Array.isArray(existingItems) ? existingItems : [])
      .map((item) => serializeChecklistItem(item))
      .map((item) => [item.itemId, item])
  );

  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const existing = item?.itemId ? existingById.get(item.itemId) : null;
      return serializeChecklistItem({
        ...existing,
        ...item,
        itemId: item?.itemId || existing?.itemId || buildGeneratedId('chk')
      });
    })
    .filter((item) => item.label);
};

const serializeBriefingTimelineItem = (item = {}) => ({
  itemId: item.itemId || buildGeneratedId('brief'),
  title: normalizeString(item.title),
  details: normalizeString(item.details),
  startsAt: item.startsAt || null,
  owner: BRIEFING_OWNERS.has(normalizeString(item.owner)) ? normalizeString(item.owner) : 'organizer'
});

const normalizeBriefingTimeline = (items = [], existingItems = []) => {
  const existingById = new Map(
    (Array.isArray(existingItems) ? existingItems : [])
      .map((item) => serializeBriefingTimelineItem(item))
      .map((item) => [item.itemId, item])
  );

  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const existing = item?.itemId ? existingById.get(item.itemId) : null;
      return serializeBriefingTimelineItem({
        ...existing,
        ...item,
        itemId: item?.itemId || existing?.itemId || buildGeneratedId('brief')
      });
    })
    .filter((item) => item.title);
};

const normalizeSpeakerWorkspace = (workspace = {}, existingWorkspace = {}) => ({
  greenRoomNotes: normalizeString(
    workspace.greenRoomNotes !== undefined
      ? workspace.greenRoomNotes
      : existingWorkspace.greenRoomNotes
  ),
  sharedResources:
    workspace.sharedResources !== undefined
      ? normalizeSpeakerResources(workspace.sharedResources, existingWorkspace.sharedResources)
      : normalizeSpeakerResources(existingWorkspace.sharedResources),
  briefingTimeline:
    workspace.briefingTimeline !== undefined
      ? normalizeBriefingTimeline(workspace.briefingTimeline, existingWorkspace.briefingTimeline)
      : normalizeBriefingTimeline(existingWorkspace.briefingTimeline)
});

const serializeSpeakerWorkspace = (workspace = {}) => normalizeSpeakerWorkspace(workspace);

const normalizeCapacity = (value, fallback = undefined) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }

  return numeric;
};

const normalizeSpeakerSession = (session = {}, existingSession = {}) => ({
  ...existingSession,
  ...session,
  sessionId: normalizeString(session.sessionId || existingSession.sessionId) || buildGeneratedId('sess'),
  title: normalizeString(session.title !== undefined ? session.title : existingSession.title),
  description: normalizeString(
    session.description !== undefined ? session.description : existingSession.description
  ),
  startsAt: session.startsAt !== undefined ? session.startsAt : existingSession.startsAt || null,
  endsAt: session.endsAt !== undefined ? session.endsAt : existingSession.endsAt || null,
  roomLabel: normalizeString(session.roomLabel !== undefined ? session.roomLabel : existingSession.roomLabel),
  capacity: normalizeCapacity(
    session.capacity !== undefined ? session.capacity : existingSession.capacity,
    undefined
  ),
  speakerNames:
    session.speakerNames !== undefined
      ? normalizeStringArray(session.speakerNames)
      : normalizeStringArray(existingSession.speakerNames),
  deckUrl: normalizeString(session.deckUrl !== undefined ? session.deckUrl : existingSession.deckUrl),
  speakerPrepNotes: normalizeString(
    session.speakerPrepNotes !== undefined
      ? session.speakerPrepNotes
      : existingSession.speakerPrepNotes
  ),
  rehearsalChecklist:
    session.rehearsalChecklist !== undefined
      ? normalizeChecklistItems(session.rehearsalChecklist, existingSession.rehearsalChecklist)
      : normalizeChecklistItems(existingSession.rehearsalChecklist),
  resourceLinks:
    session.resourceLinks !== undefined
      ? normalizeSpeakerResources(session.resourceLinks, existingSession.resourceLinks)
      : normalizeSpeakerResources(existingSession.resourceLinks),
  postSessionResources:
    session.postSessionResources !== undefined
      ? normalizeSpeakerResources(session.postSessionResources, existingSession.postSessionResources)
      : normalizeSpeakerResources(existingSession.postSessionResources)
});

const normalizeSpeakerSessions = (sessions = [], existingSessions = []) => {
  const normalizedExistingSessions = Array.isArray(existingSessions) ? existingSessions : [];
  const existingByKey = new Map(
    normalizedExistingSessions.map((session) => [buildSessionLookupKey(session), session])
  );

  return (Array.isArray(sessions) ? sessions : []).map((session, index) => {
    const matchingExisting =
      existingByKey.get(buildSessionLookupKey(session)) ||
      normalizedExistingSessions[index] ||
      {};

    return normalizeSpeakerSession(session, matchingExisting);
  });
};

const serializeSpeakerSession = (session = {}, { includePrivate = true, canEditWorkspace = false } = {}) => {
  const normalized = normalizeSpeakerSession(session, session);
  const sessionRouteId = normalizeString(session.sessionId) || buildDerivedSessionId(session);

  return {
    sessionId: sessionRouteId,
    title: normalized.title,
    description: normalized.description,
    startsAt: normalized.startsAt,
    endsAt: normalized.endsAt,
    roomLabel: normalized.roomLabel,
    capacity: normalized.capacity || null,
    speakerNames: normalized.speakerNames || [],
    canEditWorkspace,
    ...(includePrivate
      ? {
          deckUrl: normalized.deckUrl || '',
          speakerPrepNotes: normalized.speakerPrepNotes || '',
          rehearsalChecklist: normalized.rehearsalChecklist || [],
          resourceLinks: normalized.resourceLinks || [],
          postSessionResources: normalized.postSessionResources || []
        }
      : {
          postSessionResources: normalized.postSessionResources || []
        })
  };
};

const hasMatchingUser = ({ candidateUserId = '', candidateEmail = '' }, user = {}) => {
  if (candidateUserId && candidateUserId === user.sub) {
    return true;
  }

  const normalizedCandidateEmail = normalizeEmail(candidateEmail);
  const normalizedUserEmail = normalizeEmail(user.email);
  return Boolean(
    normalizedCandidateEmail &&
      normalizedUserEmail &&
      normalizedCandidateEmail === normalizedUserEmail
  );
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

const canManageAllSpeakerSessions = (event = {}, user = {}) => {
  if (!user?.sub) {
    return false;
  }

  if (user.role === 'admin' || event.organizerId === user.sub) {
    return true;
  }

  return getAssignedTeamMembers(event, user).some((member) => SESSION_MANAGE_ROLES.has(member.role));
};

const canEditEventSpeakerWorkspace = (event = {}, user = {}) =>
  canManageAllSpeakerSessions(event, user);

const hasSpeakerAssignmentForSession = (session = {}, speakerProfile = null) => {
  if (!speakerProfile?.name) {
    return false;
  }

  const speakerName = normalizeString(speakerProfile.name).toLowerCase();
  return (session.speakerNames || []).some(
    (speakerNameValue) => normalizeString(speakerNameValue).toLowerCase() === speakerName
  );
};

const canEditSessionSpeakerWorkspace = (event = {}, user = {}, session = {}) => {
  if (canManageAllSpeakerSessions(event, user)) {
    return true;
  }

  return hasSpeakerAssignmentForSession(session, getAssignedSpeakerProfile(event, user));
};

const buildAssignedSessions = (event = {}, speakerProfile = null, teamMembers = []) => {
  const teamRoles = teamMembers.map((member) => normalizeString(member.role));
  if (teamRoles.some((role) => SESSION_MANAGE_ROLES.has(role))) {
    return event.sessions || [];
  }

  if (!speakerProfile?.name) {
    return [];
  }

  return (event.sessions || []).filter((session) => hasSpeakerAssignmentForSession(session, speakerProfile));
};

const buildSpeakerPortalEntry = (event = {}, user = {}) => {
  const speakerProfile = getAssignedSpeakerProfile(event, user);
  const teamMembers = getAssignedTeamMembers(event, user);

  if (!speakerProfile && !teamMembers.length) {
    return null;
  }

  const assignedSessions = buildAssignedSessions(event, speakerProfile, teamMembers);
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
    canEditEventWorkspace: canEditEventSpeakerWorkspace(event, user),
    speakerWorkspace: serializeSpeakerWorkspace(event.speakerWorkspace || {}),
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
    sessions: assignedSessions.map((session) =>
      serializeSpeakerSession(session, {
        includePrivate: true,
        canEditWorkspace: canEditSessionSpeakerWorkspace(event, user, session)
      })
    )
  };
};

const findSessionByRouteId = (event = {}, routeId = '') =>
  (event.sessions || []).find((session) => {
    const sessionId = normalizeString(session.sessionId);
    if (sessionId && sessionId === routeId) {
      return true;
    }

    return buildDerivedSessionId(session) === routeId;
  }) || null;

module.exports = {
  buildAssignedSessions,
  buildDerivedSessionId,
  buildSessionLookupKey,
  buildSpeakerPortalEntry,
  canEditEventSpeakerWorkspace,
  canEditSessionSpeakerWorkspace,
  canManageAllSpeakerSessions,
  findSessionByRouteId,
  getAssignedSpeakerProfile,
  getAssignedTeamMembers,
  hasMatchingUser,
  normalizeBriefingTimeline,
  normalizeChecklistItems,
  normalizeEmail,
  normalizeSpeakerResources,
  normalizeSpeakerSession,
  normalizeSpeakerSessions,
  normalizeSpeakerWorkspace,
  normalizeString,
  serializeSpeakerSession,
  serializeSpeakerWorkspace
};
