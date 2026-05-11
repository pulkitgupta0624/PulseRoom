const FOLLOWABLE_ORGANIZER_ROLES = new Set(['organizer', 'admin']);

export const deriveOrganizerFollowState = ({
  organizerProfile,
  organizerId = '',
  viewerUser = null
}) => {
  const viewerId = viewerUser?.id || viewerUser?.sub || '';
  const resolvedOrganizerId = organizerProfile?.userId || organizerId || '';
  const isFollowableOrganizer = Boolean(
    organizerProfile &&
      (organizerProfile.isFollowableOrganizer ?? FOLLOWABLE_ORGANIZER_ROLES.has(organizerProfile.role))
  );
  const isSelf = Boolean(viewerId && resolvedOrganizerId && viewerId === resolvedOrganizerId);

  return {
    isFollowableOrganizer,
    canFollowOrganizer: Boolean(isFollowableOrganizer && viewerId && !isSelf),
    shouldPromptSignIn: Boolean(isFollowableOrganizer && !viewerId && !isSelf)
  };
};
