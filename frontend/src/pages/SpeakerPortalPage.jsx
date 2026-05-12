import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SectionHeader from '../components/SectionHeader';
import { api } from '../lib/api';
import { formatDate } from '../lib/formatters';

const ROLE_META = {
  speaker: 'bg-dusk/10 text-dusk',
  moderator: 'bg-reef/10 text-reef',
  checkin: 'bg-amber-100 text-amber-700',
  producer: 'bg-ink/8 text-ink/60'
};

const RolePill = ({ role }) => (
  <span
    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
      ROLE_META[role] || ROLE_META.producer
    }`}
  >
    {role === 'checkin' ? 'Check-in' : role}
  </span>
);

const EmptyState = () => (
  <div className="rounded-[32px] border border-ink/10 bg-white/80 px-6 py-14 text-center shadow-bloom">
    <p className="font-display text-3xl text-ink">No speaker or staff assignments yet</p>
    <p className="mt-3 text-sm text-ink/55">
      Once an organizer assigns you to a stage slot or event team role, your workspace will show up here.
    </p>
  </div>
);

const AssignmentCard = ({ assignment }) => {
  const speakerProfile = assignment.speakerProfile;
  const canUseCheckInDesk = assignment.assignmentRoles.includes('checkin');
  const canOpenLiveRoom = ['speaker', 'moderator', 'producer'].some((role) =>
    assignment.assignmentRoles.includes(role)
  );

  return (
    <article className="rounded-[32px] border border-ink/10 bg-white/82 p-5 shadow-bloom">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-3xl text-ink">{assignment.title}</h3>
            {assignment.assignmentRoles.map((role) => (
              <RolePill key={role} role={role} />
            ))}
          </div>

          <p className="max-w-3xl text-sm leading-6 text-ink/62">{assignment.summary}</p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] bg-sand/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Starts</p>
              <p className="mt-2 text-sm font-semibold text-ink">{formatDate(assignment.startsAt)}</p>
            </div>
            <div className="rounded-[22px] bg-sand/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Format</p>
              <p className="mt-2 text-sm font-semibold capitalize text-ink">{assignment.type}</p>
            </div>
            <div className="rounded-[22px] bg-sand/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Location</p>
              <p className="mt-2 text-sm font-semibold text-ink">
                {[assignment.venueName, assignment.city, assignment.country].filter(Boolean).join(' · ') || 'Online'}
              </p>
            </div>
          </div>

          {speakerProfile && (
            <div className="rounded-[24px] border border-dusk/12 bg-dusk/5 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-dusk">Speaker Profile</p>
              <p className="mt-2 font-semibold text-ink">
                {[speakerProfile.name, speakerProfile.title, speakerProfile.company].filter(Boolean).join(' · ')}
              </p>
              {speakerProfile.bio && (
                <p className="mt-2 text-sm leading-6 text-ink/62">{speakerProfile.bio}</p>
              )}
            </div>
          )}

          {assignment.teamMembers.length > 0 && (
            <div className="rounded-[24px] border border-ink/10 bg-sand/50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Team Notes</p>
              <div className="mt-3 space-y-3">
                {assignment.teamMembers.map((member, index) => (
                  <div key={`${member.role}-${index}`} className="rounded-2xl bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <RolePill role={member.role} />
                      <p className="text-sm font-semibold text-ink">{member.name}</p>
                    </div>
                    {member.notes && (
                      <p className="mt-2 text-sm text-ink/60">{member.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {assignment.sessions.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Assigned Sessions</p>
              <div className="space-y-3">
                {assignment.sessions.map((session) => (
                  <div key={`${assignment.eventId}-${session.title}-${session.startsAt}`} className="rounded-[24px] bg-sand/60 px-4 py-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-semibold text-ink">{session.title}</p>
                        <p className="mt-1 text-sm text-ink/58">
                          {[session.roomLabel, formatDate(session.startsAt)].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    {session.description && (
                      <p className="mt-2 text-sm leading-6 text-ink/62">{session.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 xl:w-[240px] xl:justify-end">
          <Link
            to={`/events/${assignment.eventId}`}
            className="rounded-full border border-ink/10 bg-sand px-4 py-2 text-sm font-semibold text-ink transition hover:bg-white"
          >
            Event page
          </Link>
          {canOpenLiveRoom && (
            <Link
              to={`/events/${assignment.eventId}/live`}
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-sand transition hover:bg-ink/90"
            >
              Open live room
            </Link>
          )}
          {canUseCheckInDesk && (
            <Link
              to={`/events/${assignment.eventId}/check-in`}
              className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
            >
              Open check-in desk
            </Link>
          )}
        </div>
      </div>
    </article>
  );
};

const SpeakerPortalPage = () => {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadAssignments = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get('/api/events/speaker/portal');
        setAssignments(response.data.data.assignments || []);
      } catch (loadError) {
        setError(loadError.response?.data?.message || 'Unable to load your speaker workspace right now.');
      } finally {
        setLoading(false);
      }
    };

    loadAssignments();
  }, []);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const nextUpcoming = [];
    const nextPast = [];

    assignments.forEach((assignment) => {
      const endTime = new Date(assignment.endsAt || assignment.startsAt || 0).getTime();
      if (endTime >= now) {
        nextUpcoming.push(assignment);
      } else {
        nextPast.push(assignment);
      }
    });

    return {
      upcoming: nextUpcoming,
      past: nextPast
    };
  }, [assignments]);

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Workspace"
        title="Speaker and staff hub"
        description="Your assigned events, session blocks, team notes, and quick links for live-room or venue work."
      />

      {error && (
        <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
      )}

      {loading ? (
        <div className="grid gap-5">
          {[...Array(2)].map((_, index) => (
            <div key={index} className="h-64 animate-pulse rounded-[32px] bg-white/60" />
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-display text-2xl text-ink">Upcoming assignments</h2>
              <div className="space-y-4">
                {upcoming.map((assignment) => (
                  <AssignmentCard key={`${assignment.eventId}-upcoming`} assignment={assignment} />
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-display text-2xl text-ink">Past assignments</h2>
              <div className="space-y-4">
                {past.map((assignment) => (
                  <AssignmentCard key={`${assignment.eventId}-past`} assignment={assignment} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default SpeakerPortalPage;
