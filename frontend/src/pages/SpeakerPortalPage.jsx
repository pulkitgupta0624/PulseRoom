import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SectionHeader from '../components/SectionHeader';
import SpeakerSessionToolkitEditor from '../components/SpeakerSessionToolkitEditor';
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

const AssignmentCard = ({
  assignment,
  onSessionChange,
  onSaveSession,
  sessionSavingId
}) => {
  const speakerProfile = assignment.speakerProfile;
  const canUseCheckInDesk = assignment.assignmentRoles.includes('checkin');
  const canOpenLiveRoom = ['speaker', 'moderator', 'producer'].some((role) =>
    assignment.assignmentRoles.includes(role)
  );
  const hasWorkspaceContext =
    assignment.speakerWorkspace?.greenRoomNotes ||
    assignment.speakerWorkspace?.sharedResources?.length > 0 ||
    assignment.speakerWorkspace?.briefingTimeline?.length > 0;

  return (
    <article className="rounded-[32px] border border-ink/10 bg-white/82 p-5 shadow-bloom">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1 space-y-5">
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

          {hasWorkspaceContext && (
            <div className="space-y-4 rounded-[24px] border border-ink/10 bg-sand/45 px-4 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Green room</p>
                <p className="mt-2 text-sm leading-6 text-ink/62">
                  {assignment.speakerWorkspace.greenRoomNotes || 'No backstage notes yet.'}
                </p>
              </div>

              {assignment.speakerWorkspace.sharedResources?.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Shared resources</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {assignment.speakerWorkspace.sharedResources.map((resource) => (
                      <a
                        key={resource.resourceId || resource.url}
                        href={resource.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-semibold text-reef hover:bg-sand"
                      >
                        {resource.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {assignment.speakerWorkspace.briefingTimeline?.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Briefing timeline</p>
                  <div className="mt-3 space-y-2">
                    {assignment.speakerWorkspace.briefingTimeline.map((item) => (
                      <div key={item.itemId || item.title} className="rounded-2xl bg-white px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-ink">{item.title}</p>
                          <span className="rounded-full border border-ink/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-ink/45">
                            {item.owner}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-ink/45">
                          {item.startsAt ? formatDate(item.startsAt) : 'Timing not set'}
                        </p>
                        {item.details && (
                          <p className="mt-2 text-sm text-ink/62">{item.details}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {assignment.sessions.length > 0 ? (
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Assigned Sessions</p>
              <div className="space-y-4">
                {assignment.sessions.map((session) => (
                  <SpeakerSessionToolkitEditor
                    key={session.sessionId}
                    session={session}
                    onChange={(nextSession) => onSessionChange(assignment.eventId, session.sessionId, nextSession)}
                    onSave={() => onSaveSession(assignment.eventId, session)}
                    saving={sessionSavingId === `${assignment.eventId}:${session.sessionId}`}
                    readOnly={!session.canEditWorkspace}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-[24px] border border-ink/10 bg-sand/45 px-4 py-4 text-sm text-ink/55">
              No session toolkit is assigned to this role yet.
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
  const [sessionSavingId, setSessionSavingId] = useState(null);
  const [status, setStatus] = useState(null);

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

  const updateAssignmentSession = (eventId, sessionId, nextSession) => {
    setAssignments((current) =>
      current.map((assignment) =>
        assignment.eventId === eventId
          ? {
              ...assignment,
              sessions: assignment.sessions.map((session) =>
                session.sessionId === sessionId ? nextSession : session
              )
            }
          : assignment
      )
    );
  };

  const saveAssignmentSession = async (eventId, session) => {
    setSessionSavingId(`${eventId}:${session.sessionId}`);
    setStatus(null);
    setError(null);
    try {
      const response = await api.patch(
        `/api/events/${eventId}/speaker-workspace/sessions/${session.sessionId}`,
        {
          deckUrl: session.deckUrl || '',
          speakerPrepNotes: session.speakerPrepNotes || '',
          rehearsalChecklist: (session.rehearsalChecklist || []).filter((item) => item.label?.trim()),
          resourceLinks: (session.resourceLinks || []).filter(
            (item) => item.label?.trim() && item.url?.trim()
          ),
          postSessionResources: (session.postSessionResources || []).filter(
            (item) => item.label?.trim() && item.url?.trim()
          )
        }
      );

      setAssignments((current) =>
        current.map((assignment) =>
          assignment.eventId === eventId
            ? {
                ...assignment,
                sessions: assignment.sessions.map((item) =>
                  item.sessionId === session.sessionId ? response.data.data : item
                )
              }
            : assignment
        )
      );
      setStatus('Session toolkit saved.');
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to save that session toolkit.');
    } finally {
      setSessionSavingId(null);
    }
  };

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
        description="Your assigned events, green-room context, session prep workspace, and quick links for live-room or venue work."
      />

      {error && (
        <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
      )}
      {status && (
        <p className="rounded-2xl bg-reef/10 px-4 py-3 text-sm text-reef">{status}</p>
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
                  <AssignmentCard
                    key={`${assignment.eventId}-upcoming`}
                    assignment={assignment}
                    onSessionChange={updateAssignmentSession}
                    onSaveSession={saveAssignmentSession}
                    sessionSavingId={sessionSavingId}
                  />
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-display text-2xl text-ink">Past assignments</h2>
              <div className="space-y-4">
                {past.map((assignment) => (
                  <AssignmentCard
                    key={`${assignment.eventId}-past`}
                    assignment={assignment}
                    onSessionChange={updateAssignmentSession}
                    onSaveSession={saveAssignmentSession}
                    sessionSavingId={sessionSavingId}
                  />
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
