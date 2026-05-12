import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { downloadTextFile } from '../lib/downloads';
import { formatDate } from '../lib/formatters';
import ModalShell from './ModalShell';

const PRIORITY_STYLES = {
  high: 'bg-ember/10 text-ember',
  medium: 'bg-dusk/10 text-dusk',
  low: 'bg-reef/10 text-reef'
};

const OWNER_LABELS = {
  organizer: 'Organizer',
  attendee: 'Attendee',
  speaker: 'Speaker'
};

const slugifyFilePart = (value, fallback = 'event') =>
  String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || fallback;

const buildRecapMarkdown = ({ event, summary }) => {
  const lines = [
    `# ${event.title} - AI Recap`,
    '',
    `Generated: ${summary.generatedAt ? new Date(summary.generatedAt).toLocaleString() : 'Just now'}`,
    `Event window: ${formatDate(event.startsAt)} to ${formatDate(event.endsAt)}`,
    '',
    '## Executive Summary',
    summary.executiveSummary || 'No summary available.',
    ''
  ];

  if (summary.keyTakeaways?.length) {
    lines.push('## Key Takeaways');
    summary.keyTakeaways.forEach((item) => lines.push(`- ${item}`));
    lines.push('');
  }

  if (summary.followUpActions?.length) {
    lines.push('## Follow-up Actions');
    summary.followUpActions.forEach((item) => {
      lines.push(`- [${OWNER_LABELS[item.owner] || 'Organizer'} | ${String(item.priority || 'medium').toUpperCase()}] ${item.action}`);
    });
    lines.push('');
  }

  if (summary.audienceSignals?.length) {
    lines.push('## Audience Signals');
    summary.audienceSignals.forEach((item) => {
      lines.push(`- ${item.signal}: ${item.evidence}`);
    });
    lines.push('');
  }

  if (summary.flashcards?.length) {
    lines.push('## Flashcards');
    summary.flashcards.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.front}`);
      lines.push(`   ${item.back}`);
    });
    lines.push('');
  }

  if (summary.sourceMetrics) {
    lines.push('## Source Metrics');
    lines.push(`- Polls: ${summary.sourceMetrics.pollCount || 0}`);
    lines.push(`- Questions: ${summary.sourceMetrics.questionCount || 0}`);
    lines.push(`- Announcements: ${summary.sourceMetrics.announcementCount || 0}`);
    lines.push(`- Reactions: ${summary.sourceMetrics.reactionCount || 0}`);
    lines.push(`- Total Interactions: ${summary.sourceMetrics.totalInteractions || 0}`);
    lines.push(`- Peak Interactions / Minute: ${summary.sourceMetrics.peakInteractions || 0}`);
  }

  return lines.join('\n');
};

const MetricTile = ({ label, value, accent = 'text-ink' }) => (
  <div className="rounded-[22px] border border-ink/8 bg-white px-4 py-4">
    <p className="text-xs uppercase tracking-[0.18em] text-ink/45">{label}</p>
    <p className={`mt-2 font-display text-3xl ${accent}`}>{value}</p>
  </div>
);

const EventRecapStudioModal = ({ event, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [readyForRecap, setReadyForRecap] = useState(false);
  const [summary, setSummary] = useState(null);

  const recapMarkdown = useMemo(
    () => (summary ? buildRecapMarkdown({ event, summary }) : ''),
    [event, summary]
  );

  const loadSummary = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/api/events/${event._id}/post-event-summary`);
      setReadyForRecap(Boolean(response.data.data.readyForRecap));
      setSummary(response.data.data.summary || null);
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Unable to load the event recap studio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, [event._id]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setStatus(null);

    try {
      const response = await api.post(`/api/events/${event._id}/assistant/post-event-summary`, {});
      setReadyForRecap(Boolean(response.data.data.readyForRecap));
      setSummary(response.data.data.summary || null);
      setStatus({
        tone: 'success',
        message: summary
          ? 'AI recap refreshed from the latest event activity.'
          : 'AI recap generated successfully.'
      });
    } catch (generateError) {
      setError(generateError.response?.data?.message || 'Unable to generate the AI recap right now.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!recapMarkdown) {
      return;
    }

    try {
      await navigator.clipboard.writeText(recapMarkdown);
      setStatus({
        tone: 'success',
        message: 'Recap copied to your clipboard.'
      });
    } catch (_error) {
      setStatus({
        tone: 'error',
        message: 'Clipboard access was blocked in this browser.'
      });
    }
  };

  const handleDownload = () => {
    if (!recapMarkdown) {
      return;
    }

    downloadTextFile({
      content: recapMarkdown,
      fileName: `${slugifyFilePart(event.title)}-ai-recap.md`,
      mimeType: 'text/markdown;charset=utf-8'
    });
    setStatus({
      tone: 'success',
      message: 'Recap markdown downloaded.'
    });
  };

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="event-recap-studio-title"
      panelClassName="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-bloom"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-ink/10 bg-white px-6 py-5">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-dusk">AI Recap Studio</p>
          <h2 id="event-recap-studio-title" className="mt-1 font-display text-3xl text-ink">
            {event.title}
          </h2>
          <p className="mt-2 text-sm text-ink/55">
            Turn live engagement into a clean post-event debrief with takeaways, actions, and study notes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/events/${event._id}/live`}
            className="rounded-full border border-ink/15 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink"
          >
            Open replay
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI recap studio"
            className="rounded-full p-2 text-ink/50 transition hover:bg-sand hover:text-ink"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-dusk border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              <MetricTile label="Polls" value={summary?.sourceMetrics?.pollCount || 0} />
              <MetricTile label="Questions" value={summary?.sourceMetrics?.questionCount || 0} accent="text-dusk" />
              <MetricTile label="Announcements" value={summary?.sourceMetrics?.announcementCount || 0} />
              <MetricTile label="Reactions" value={summary?.sourceMetrics?.reactionCount || 0} accent="text-reef" />
              <MetricTile label="Interactions" value={summary?.sourceMetrics?.totalInteractions || 0} accent="text-ember" />
              <MetricTile label="Peak / Min" value={summary?.sourceMetrics?.peakInteractions || 0} accent="text-dusk" />
            </section>

            {error && (
              <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
            )}

            {status && (
              <p className={`rounded-2xl px-4 py-3 text-sm ${
                status.tone === 'error' ? 'bg-ember/10 text-ember' : 'bg-reef/10 text-reef'
              }`}>
                {status.message}
              </p>
            )}

            <section className="rounded-[28px] border border-ink/10 bg-white/85 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Summary Controls</p>
                  <h3 className="mt-1 font-display text-2xl text-ink">Generate an organizer-ready recap</h3>
                  <p className="mt-2 text-sm text-ink/60">
                    Use the latest Q&A, polls, reactions, announcements, and engagement spikes as source material.
                  </p>
                  {summary?.generatedAt && (
                    <p className="mt-3 text-xs text-ink/45">
                      Last generated {formatDate(summary.generatedAt)}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!readyForRecap || generating}
                    className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-sand disabled:opacity-60"
                  >
                    {generating ? 'Generating...' : summary ? 'Refresh recap' : 'Generate recap'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!summary}
                    className="rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink/70 disabled:opacity-50"
                  >
                    Copy markdown
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={!summary}
                    className="rounded-full border border-dusk/20 bg-dusk/5 px-5 py-2.5 text-sm font-semibold text-dusk disabled:opacity-50"
                  >
                    Download
                  </button>
                </div>
              </div>

              {!readyForRecap && (
                <p className="mt-4 rounded-2xl bg-amber-100 px-4 py-3 text-sm text-amber-700">
                  AI recap opens after the event has ended. This one is scheduled until {formatDate(event.endsAt)}.
                </p>
              )}
            </section>

            {!summary ? (
              <section className="rounded-[28px] border border-ink/10 bg-sand/45 px-6 py-14 text-center">
                <p className="font-display text-2xl text-ink">No recap yet</p>
                <p className="mt-3 text-sm text-ink/60">
                  Generate the first recap to package what happened into a reusable organizer brief.
                </p>
              </section>
            ) : (
              <section className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
                <div className="space-y-6">
                  <article className="rounded-[28px] border border-ink/10 bg-white/85 p-5">
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Executive Summary</p>
                    <p className="mt-3 text-sm leading-7 text-ink/78">{summary.executiveSummary}</p>
                  </article>

                  <article className="rounded-[28px] border border-ink/10 bg-white/85 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Key Takeaways</p>
                        <h3 className="mt-1 font-display text-2xl text-ink">What stood out</h3>
                      </div>
                      <span className="rounded-full bg-sand px-3 py-1 text-xs text-ink/45">
                        {summary.keyTakeaways?.length || 0} items
                      </span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {(summary.keyTakeaways || []).map((item, index) => (
                        <div key={`${item}-${index}`} className="rounded-2xl bg-sand/60 px-4 py-4">
                          <p className="text-sm text-ink/75">{item}</p>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="rounded-[28px] border border-ink/10 bg-white/85 p-5">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Audience Signals</p>
                      <h3 className="mt-1 font-display text-2xl text-ink">What the room told us</h3>
                    </div>
                    <div className="mt-4 space-y-3">
                      {(summary.audienceSignals || []).map((item, index) => (
                        <div key={`${item.signal}-${index}`} className="rounded-2xl border border-ink/8 bg-sand/45 px-4 py-4">
                          <p className="font-semibold text-ink">{item.signal}</p>
                          <p className="mt-1 text-sm text-ink/65">{item.evidence}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>

                <div className="space-y-6">
                  <article className="rounded-[28px] border border-ink/10 bg-white/85 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Follow-up Actions</p>
                        <h3 className="mt-1 font-display text-2xl text-ink">What happens next</h3>
                      </div>
                      <span className="rounded-full bg-sand px-3 py-1 text-xs text-ink/45">
                        {summary.followUpActions?.length || 0} actions
                      </span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {(summary.followUpActions || []).map((item, index) => (
                        <div key={`${item.action}-${index}`} className="rounded-2xl border border-ink/8 bg-sand/45 px-4 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-ink/10 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/60">
                              {OWNER_LABELS[item.owner] || 'Organizer'}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                              PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.medium
                            }`}>
                              {item.priority}
                            </span>
                          </div>
                          <p className="mt-3 text-sm text-ink/75">{item.action}</p>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="rounded-[28px] border border-ink/10 bg-white/85 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Flashcards</p>
                        <h3 className="mt-1 font-display text-2xl text-ink">Reusable study notes</h3>
                      </div>
                      <span className="rounded-full bg-sand px-3 py-1 text-xs text-ink/45">
                        {summary.flashcards?.length || 0} cards
                      </span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {(summary.flashcards || []).map((item, index) => (
                        <div key={`${item.front}-${index}`} className="rounded-2xl border border-dusk/12 bg-dusk/5 px-4 py-4">
                          <p className="text-xs uppercase tracking-[0.16em] text-dusk">Front</p>
                          <p className="mt-2 font-semibold text-ink">{item.front}</p>
                          <p className="mt-4 text-xs uppercase tracking-[0.16em] text-ink/40">Back</p>
                          <p className="mt-2 text-sm text-ink/68">{item.back}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
};

export default EventRecapStudioModal;
