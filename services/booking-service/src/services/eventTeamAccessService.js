const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const hasAssignedEventTeamRole = ({ eventMeta, user, role }) =>
  (eventMeta?.teamMembers || []).some((member) => {
    if (member.role !== role) {
      return false;
    }

    if (member.userId && member.userId === user.sub) {
      return true;
    }

    return Boolean(
      normalizeEmail(member.email) &&
      normalizeEmail(user.email) &&
      normalizeEmail(member.email) === normalizeEmail(user.email)
    );
  });

module.exports = {
  hasAssignedEventTeamRole,
  normalizeEmail
};
