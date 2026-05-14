import { useEffect, useState } from 'react';
import ModalShell from './ModalShell';
import { api } from '../lib/api';
import { formatDate } from '../lib/formatters';
import SpeakerSessionToolkitEditor from './SpeakerSessionToolkitEditor';

const createDraftId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

const toDatetimeLocal = (value) => {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return '';
  }

  const pad = (number) => String(number).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

const normalizeWorkspaceDraft = (workspace = {}) => ({
  greenRoomNotes: workspace.greenRoomNotes || '',
  sharedResources: (workspace.sharedResources || []).map((resource) => ({
    resourceId: resource.resourceId || createDraftId('res'),
    label: resource.label || '',
    url: resource.url || '',
    type: resource.type || 'resource'
  })),
  briefingTimeline: (workspace.briefingTimeline || []).map((item) => ({
    itemId: item.itemId || createDraftId('brief'),
    title: item.title || '',
    details: item.details || '',
    owner: item.owner || 'organizer',
    startsAt: toDatetimeLocal(item.startsAt)
  }))
});

const ResourceRow = ({ item, onChange, onRemove }) => (
  <div className="grid gap-3 rounded-2xl bg-white px-3 py-3 md:grid-cols-[0.95fr,1.2fr,0.7fr,auto]">
    <input
      value={item.label}
      onChange={(eventInput) => onChange({ ...item, label: eventInput.target.value })}
      placeholder="Label"
      className="rounded-xl border border-ink/10 bg-sand px-3 py-2 text-sm outline-none focus:border-reef"
    />
    <input
      value={item.url}
      onChange={(eventInput) => onChange({ ...item, url: eventInput.target.value })}
      placeholder="https://..."
      className="rounded-xl border border-ink/10 bg-sand px-3 py-2 text-sm outline-none focus:border-reef"
    />
    <select
      value={item.type}
      onChange={(eventInput) => onChange({ ...item, type: eventInput.target.value })}
      className="rounded-xl border border-ink/10 bg-sand px-3 py-2 text-sm outline-none focus:border-reef"
    >
      {['resource', 'brief', 'deck', 'doc', 'slides', 'video', 'link'].map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
    <button
      type="button"
      onClick={onRemove}
      className="rounded-full border border-ember/20 bg-ember/5 px-3 py-1.5 text-xs font-semibold text-ember hover:bg-ember/10"
    >
      Remove
    </button>
  </div>
);

const TimelineRow = ({ item, onChange, onRemove }) => (
  <div className="space-y-3 rounded-2xl bg-white px-3 py-3">
    <div className="grid gap-3 md:grid-cols-[0.95fr,0.8fr,0.7fr,auto]">
      <input
        value={item.title}
        onChange={(eventInput) => onChange({ ...item, title: eventInput.target.value })}
        placeholder="Moment title"
        className="rounded-xl border border-ink/10 bg-sand px-3 py-2 text-sm outline-none focus:border-reef"
      />
      <input
        type="datetime-local"
        value={item.startsAt}
        onChange={(eventInput) => onChange({ ...item, startsAt: eventInput.target.value })}
        className="rounded-xl border border-ink/10 bg-sand px-3 py-2 text-sm outline-none focus:border-reef"
      />
      <select
        value={item.owner}
        onChange={(eventInput) => onChange({ ...item, owner: eventInput.target.value })}
        className="rounded-xl border border-ink/10 bg-sand px-3 py-2 text-sm outline-none focus:border-reef"
      >
        {['organizer', 'speaker', 'moderator', 'producer'].map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full border border-ember/20 bg-ember/5 px-3 py-1.5 text-xs font-semibold text-ember hover:bg-ember/10"
      >
        Remove
      </button>
    </div>
    <textarea
      value={item.details}
      onChange={(eventInput) => onChange({ ...item, details: eventInput.target.value })}
      rows={2}
      placeholder="What should happen at this moment?"
      className="w-full rounded-xl border border-ink/10 bg-sand px-3 py-3 text-sm outline-none focus:border-reef"
    />
  </div>
);

const SpeakerToolkitModal = ({ event, onClose }) => {
  const [workspaceData, setWorkspaceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [sessionSavingId, setSessionSavingId] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(`/api/events/${event._id}/speaker-workspace/manage`);
        setWorkspaceData({
          ...response.data.data,
          speakerWorkspace: normalizeWorkspaceDraft(response.data.data.speakerWorkspace),
          sessions: response.data.data.sessions || []
        });
      } catch (loadError) {
        setError(loadError.response?.data?.message || 'Unable to load the speaker toolkit right now.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [event._id]);

  const updateWorkspace = (updater) =>
    setWorkspaceData((current) => ({
      ...current,
      speakerWorkspace: typeof updater === 'function' ? updater(current.speakerWorkspace) : updater
    }));

  const updateWorkspaceResource = (index, nextResource) =>
    updateWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      sharedResources: currentWorkspace.sharedResources.map((resource, resourceIndex) =>
        resourceIndex === index ? nextResource : resource
      )
    }));

  const updateTimelineItem = (index, nextItem) =>
    updateWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      briefingTimeline: currentWorkspace.briefingTimeline.map((item, itemIndex) =>
        itemIndex === index ? nextItem : item
      )
    }));

  const saveWorkspace = async () => {
    setWorkspaceSaving(true);
    setError(null);
    try {
      const payload = {
        greenRoomNotes: workspaceData.speakerWorkspace.greenRoomNotes,
        sharedResources: workspaceData.speakerWorkspace.sharedResources.filter(
          (resource) => resource.label?.trim() && resource.url?.trim()
        ),
        briefingTimeline: workspaceData.speakerWorkspace.briefingTimeline
          .filter((item) => item.title?.trim())
          .map((item) => ({
            ...item,
            startsAt: item.startsAt || null
          }))
      };
      const response = await api.patch(`/api/events/${event._id}/speaker-workspace`, payload);
      setWorkspaceData((current) => ({
        ...current,
        ...response.data.data,
        speakerWorkspace: normalizeWorkspaceDraft(response.data.data.speakerWorkspace),
        sessions: response.data.data.sessions || current.sessions
      }));
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to save the speaker toolkit workspace.');
    } finally {
      setWorkspaceSaving(false);
    }
  };

  const updateSession = (sessionId, nextSession) =>
    setWorkspaceData((current) => ({
      ...current,
      sessions: current.sessions.map((session) => (session.sessionId === sessionId ? nextSession : session))
    }));

  const saveSession = async (session) => {
    setSessionSavingId(session.sessionId);
    setError(null);
    try {
      const response = await api.patch(
        `/api/events/${event._id}/speaker-workspace/sessions/${session.sessionId}`,
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

      setWorkspaceData((current) => ({
        ...current,
        sessions: current.sessions.map((item) =>
          item.sessionId === session.sessionId ? response.data.data : item
        )
      }));
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to save that session toolkit.');
    } finally {
      setSessionSavingId(null);
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="speaker-toolkit-title"
      closeOnBackdrop={false}
      panelClassName="w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-[32px] border border-ink/10 bg-white shadow-bloom"
    >
      <div className="sticky top-0 z-10 rounded-t-[32px] border-b border-ink/10 bg-white px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-dusk">Speaker Toolkit</p>
            <h2 id="speaker-toolkit-title" className="mt-1 font-display text-3xl text-ink">
              {workspaceData?.event?.title || event.title}
            </h2>
            {workspaceData?.event?.startsAt && (
              <p className="mt-2 text-sm text-ink/55">{formatDate(workspaceData.event.startsAt)}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-ink/50 hover:bg-sand hover:text-ink"
            aria-label="Close speaker toolkit"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {error && (
          <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
        )}

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="h-40 animate-pulse rounded-[28px] bg-sand/60" />
            ))}
          </div>
        ) : (
          <>
            <section className="space-y-4 rounded-[28px] border border-ink/10 bg-sand/45 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Green room</p>
                  <h3 className="mt-2 font-display text-2xl text-ink">Speaker brief and shared assets</h3>
                  <p className="mt-2 text-sm text-ink/60">
                    Give every speaker the backstage notes, run-of-show references, and timing cues they need.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={saveWorkspace}
                  disabled={workspaceSaving}
                  className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-sand disabled:opacity-60"
                >
                  {workspaceSaving ? 'Saving...' : 'Save workspace'}
                </button>
              </div>

              <div className="space-y-3 rounded-2xl border border-ink/10 bg-white/85 p-4">
                <p className="text-sm font-semibold text-ink">Green room notes</p>
                <textarea
                  value={workspaceData.speakerWorkspace.greenRoomNotes}
                  onChange={(eventInput) =>
                    updateWorkspace((currentWorkspace) => ({
                      ...currentWorkspace,
                      greenRoomNotes: eventInput.target.value
                    }))
                  }
                  rows={5}
                  placeholder="Where speakers check in, mic notes, fallback plans, confidence notes, backstage etiquette..."
                  className="w-full rounded-xl border border-ink/10 bg-sand px-3 py-3 text-sm outline-none focus:border-reef"
                />
              </div>

              <div className="space-y-3 rounded-2xl border border-ink/10 bg-white/85 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">Shared speaker resources</p>
                  <button
                    type="button"
                    onClick={() =>
                      updateWorkspace((currentWorkspace) => ({
                        ...currentWorkspace,
                        sharedResources: [...currentWorkspace.sharedResources, {
                          resourceId: createDraftId('res'),
                          label: '',
                          url: '',
                          type: 'resource'
                        }]
                      }))
                    }
                    className="rounded-full border border-ink/10 bg-sand px-3 py-1.5 text-xs font-semibold text-ink/60 hover:border-reef/20 hover:text-reef"
                  >
                    Add resource
                  </button>
                </div>
                {workspaceData.speakerWorkspace.sharedResources.length === 0 && (
                  <p className="text-sm text-ink/45">No shared resources added yet.</p>
                )}
                <div className="space-y-3">
                  {workspaceData.speakerWorkspace.sharedResources.map((item, index) => (
                    <ResourceRow
                      key={item.resourceId}
                      item={item}
                      onChange={(nextResource) => updateWorkspaceResource(index, nextResource)}
                      onRemove={() =>
                        updateWorkspace((currentWorkspace) => ({
                          ...currentWorkspace,
                          sharedResources: currentWorkspace.sharedResources.filter((_, itemIndex) => itemIndex !== index)
                        }))
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-ink/10 bg-white/85 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">Briefing timeline</p>
                  <button
                    type="button"
                    onClick={() =>
                      updateWorkspace((currentWorkspace) => ({
                        ...currentWorkspace,
                        briefingTimeline: [...currentWorkspace.briefingTimeline, {
                          itemId: createDraftId('brief'),
                          title: '',
                          details: '',
                          owner: 'organizer',
                          startsAt: ''
                        }]
                      }))
                    }
                    className="rounded-full border border-ink/10 bg-sand px-3 py-1.5 text-xs font-semibold text-ink/60 hover:border-reef/20 hover:text-reef"
                  >
                    Add moment
                  </button>
                </div>
                {workspaceData.speakerWorkspace.briefingTimeline.length === 0 && (
                  <p className="text-sm text-ink/45">Add cue points like rehearsal, speaker check-in, or stage reset windows.</p>
                )}
                <div className="space-y-3">
                  {workspaceData.speakerWorkspace.briefingTimeline.map((item, index) => (
                    <TimelineRow
                      key={item.itemId}
                      item={item}
                      onChange={(nextItem) => updateTimelineItem(index, nextItem)}
                      onRemove={() =>
                        updateWorkspace((currentWorkspace) => ({
                          ...currentWorkspace,
                          briefingTimeline: currentWorkspace.briefingTimeline.filter((_, itemIndex) => itemIndex !== index)
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Session toolkit</p>
                <h3 className="mt-2 font-display text-2xl text-ink">Decks, rehearsal, and post-talk sharing</h3>
              </div>
              {workspaceData.sessions.length === 0 ? (
                <div className="rounded-[28px] border border-ink/10 bg-sand/45 px-5 py-10 text-center">
                  <p className="text-sm text-ink/45">No sessions are configured for this event yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {workspaceData.sessions.map((session) => (
                    <SpeakerSessionToolkitEditor
                      key={session.sessionId}
                      session={session}
                      onChange={(nextSession) => updateSession(session.sessionId, nextSession)}
                      onSave={saveSession}
                      saving={sessionSavingId === session.sessionId}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </ModalShell>
  );
};

export default SpeakerToolkitModal;
