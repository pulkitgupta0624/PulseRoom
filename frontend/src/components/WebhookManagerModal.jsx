import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { formatDate } from '../lib/formatters';
import ModalShell from './ModalShell';

const createEmptyDraft = (defaultEvents = []) => ({
  targetUrl: '',
  subscribedEvents: defaultEvents,
  active: true
});

const WebhookManagerModal = ({ event, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    endpoints: [],
    availableEvents: []
  });
  const [newDraft, setNewDraft] = useState(createEmptyDraft());
  const [lastSecret, setLastSecret] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [testingId, setTestingId] = useState(null);

  const eventLabelMap = useMemo(
    () =>
      (data.availableEvents || []).reduce((accumulator, item) => {
        accumulator[item.event] = item.label;
        return accumulator;
      }, {}),
    [data.availableEvents]
  );

  const refreshData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/api/events/${event._id}/webhooks/manage`);
      const nextData = response.data.data;
      setData(nextData);
      setNewDraft((current) =>
        current.targetUrl
          ? current
          : createEmptyDraft((nextData.availableEvents || []).map((item) => item.event))
      );
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Unable to load webhooks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [event._id]);

  const toggleNewEvent = (eventName) => {
    setNewDraft((current) => ({
      ...current,
      subscribedEvents: current.subscribedEvents.includes(eventName)
        ? current.subscribedEvents.filter((item) => item !== eventName)
        : [...current.subscribedEvents, eventName]
    }));
  };

  const handleCreate = async () => {
    setSavingId('new');
    setError(null);
    setLastSecret(null);

    try {
      const response = await api.post(`/api/events/${event._id}/webhooks`, newDraft);
      setLastSecret(response.data.data.signingSecret);
      setNewDraft(createEmptyDraft((data.availableEvents || []).map((item) => item.event)));
      await refreshData();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to create webhook endpoint.');
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleActive = async (endpoint) => {
    setSavingId(endpoint._id);
    setError(null);

    try {
      await api.patch(`/api/events/${event._id}/webhooks/${endpoint._id}`, {
        active: !endpoint.active
      });
      await refreshData();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to update webhook endpoint.');
    } finally {
      setSavingId(null);
    }
  };

  const handleTest = async (endpointId) => {
    setTestingId(endpointId);
    setError(null);

    try {
      await api.post(`/api/events/${event._id}/webhooks/${endpointId}/test`);
      await refreshData();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to queue a test delivery.');
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (endpointId) => {
    setSavingId(endpointId);
    setError(null);

    try {
      await api.delete(`/api/events/${event._id}/webhooks/${endpointId}`);
      await refreshData();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to delete webhook endpoint.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="webhook-manager-title"
      panelClassName="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-bloom"
    >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-ink/10 bg-white px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-reef">Webhooks</p>
            <h2 id="webhook-manager-title" className="mt-1 font-display text-3xl text-ink">{event.title}</h2>
            <p className="mt-2 text-sm text-ink/55">
              Send signed event payloads to Slack, Zapier, Make, or your own backend.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close webhook manager"
            className="rounded-full p-2 text-ink/50 transition hover:bg-sand hover:text-ink"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-reef border-t-transparent" />
            </div>
          ) : (
            <div className="space-y-6">
              {error && (
                <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
              )}

              {lastSecret && (
                <div className="rounded-[24px] border border-dusk/20 bg-dusk/5 p-4">
                  <p className="text-sm font-semibold text-ink">Signing secret</p>
                  <p className="mt-2 text-xs text-ink/60">
                    Copy this now. It is only shown once and is used to verify `x-pulseroom-signature`.
                  </p>
                  <div className="mt-3 rounded-2xl border border-ink/8 bg-white px-4 py-3 font-mono text-sm text-ink">
                    {lastSecret}
                  </div>
                </div>
              )}

              <section className="space-y-4 rounded-[28px] border border-ink/10 bg-white/80 p-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Create endpoint</p>
                  <h3 className="mt-1 font-display text-2xl text-ink">Register a webhook URL</h3>
                </div>

                <input
                  value={newDraft.targetUrl}
                  onChange={(eventInput) => setNewDraft((current) => ({ ...current, targetUrl: eventInput.target.value }))}
                  placeholder="https://example.com/pulseroom/webhooks"
                  className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
                />

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Subscribe to events</p>
                  <div className="flex flex-wrap gap-2">
                    {(data.availableEvents || []).map((item) => {
                      const selected = newDraft.subscribedEvents.includes(item.event);
                      return (
                        <button
                          key={item.event}
                          type="button"
                          onClick={() => toggleNewEvent(item.event)}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                            selected
                              ? 'bg-reef text-white'
                              : 'border border-ink/10 bg-white text-ink/60'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={savingId === 'new'}
                  className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-sand disabled:opacity-60"
                >
                  {savingId === 'new' ? 'Creating...' : 'Create webhook'}
                </button>
              </section>

              <section className="space-y-4 rounded-[28px] border border-ink/10 bg-white/80 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Endpoints</p>
                    <h3 className="mt-1 font-display text-2xl text-ink">Delivery targets</h3>
                  </div>
                  <span className="rounded-full bg-sand px-3 py-1 text-xs text-ink/45">
                    {data.endpoints.length} endpoint{data.endpoints.length === 1 ? '' : 's'}
                  </span>
                </div>

                {!data.endpoints.length ? (
                  <div className="rounded-[24px] bg-sand/50 px-5 py-10 text-center">
                    <p className="text-sm text-ink/50">No webhook endpoints yet.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {data.endpoints.map((endpoint) => (
                      <article key={endpoint._id} className="rounded-[24px] border border-ink/10 bg-sand/55 p-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${endpoint.active ? 'bg-reef/10 text-reef' : 'bg-ink/8 text-ink/45'}`}>
                            {endpoint.active ? 'Active' : 'Paused'}
                          </span>
                          <span className="rounded-full border border-ink/10 bg-white px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-ink/45">
                            {endpoint.deliveredCount || 0} delivered
                          </span>
                          <span className="rounded-full border border-ink/10 bg-white px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-ink/45">
                            {endpoint.failedCount || 0} failed
                          </span>
                        </div>

                        <p className="mt-3 break-all rounded-2xl border border-ink/8 bg-white px-4 py-3 text-sm text-ink">
                          {endpoint.targetUrl}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {(endpoint.subscribedEvents || []).map((eventName) => (
                            <span key={eventName} className="rounded-full border border-ink/10 bg-white px-3 py-1 text-xs text-ink/60">
                              {eventLabelMap[eventName] || eventName}
                            </span>
                          ))}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-4 text-sm text-ink/55">
                          {endpoint.lastDeliveredAt && <span>Last success: {formatDate(endpoint.lastDeliveredAt)}</span>}
                          {endpoint.lastFailureAt && <span>Last failure: {formatDate(endpoint.lastFailureAt)}</span>}
                          {endpoint.lastFailureMessage && <span className="text-ember">{endpoint.lastFailureMessage}</span>}
                        </div>

                        <div className="mt-5 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(endpoint)}
                            disabled={savingId === endpoint._id}
                            className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
                          >
                            {endpoint.active ? 'Pause' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTest(endpoint._id)}
                            disabled={testingId === endpoint._id}
                            className="rounded-full border border-dusk/20 bg-dusk/5 px-4 py-2 text-sm font-semibold text-dusk disabled:opacity-60"
                          >
                            {testingId === endpoint._id ? 'Queueing...' : 'Send test'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(endpoint._id)}
                            disabled={savingId === endpoint._id}
                            className="rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-sm font-semibold text-ember disabled:opacity-60"
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
    </ModalShell>
  );
};

export default WebhookManagerModal;
