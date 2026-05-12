import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { api } from '../lib/api';

const QUICK_QUESTIONS = [
  'Which ticket should I pick?',
  'What sessions should I not miss?',
  'Where is this event happening?',
  'Who is speaking?'
];

const confidenceClasses = {
  high: 'bg-reef/10 text-reef',
  medium: 'bg-dusk/10 text-dusk',
  low: 'bg-ember/10 text-ember'
};

const EventConcierge = ({ eventId, user }) => {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);

  const suggestedQuestions = useMemo(
    () => QUICK_QUESTIONS.filter((item) => item.toLowerCase() !== question.trim().toLowerCase()),
    [question]
  );

  const askConcierge = async (eventInput) => {
    eventInput.preventDefault();
    const nextQuestion = question.trim();
    if (!nextQuestion || busy || !user) {
      return;
    }

    setBusy(true);
    try {
      const response = await api.post(`/api/events/${eventId}/assistant/ask`, {
        question: nextQuestion
      });
      setHistory((current) => [
        {
          id: `${Date.now()}-${nextQuestion}`,
          question: nextQuestion,
          answer: response.data.data.answer,
          confidence: response.data.data.confidence || 'medium',
          supportingPoints: response.data.data.supportingPoints || []
        },
        ...current
      ].slice(0, 4));
      setQuestion('');
    } catch (error) {
      setHistory((current) => [
        {
          id: `${Date.now()}-${nextQuestion}`,
          question: nextQuestion,
          answer: error.response?.data?.message || 'The concierge could not answer that right now.',
          confidence: 'low',
          supportingPoints: []
        },
        ...current
      ].slice(0, 4));
    } finally {
      setBusy(false);
    }
  };

  const handleQuickQuestion = (nextQuestion) => {
    setQuestion(nextQuestion);
  };

  return (
    <section className="rounded-[32px] border border-ink/10 bg-white/80 p-6 shadow-bloom">
      <div className="grid gap-6 lg:grid-cols-[0.72fr,1fr]">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-reef">AI concierge</p>
            <h2 className="mt-2 font-display text-3xl text-ink">Ask before you book</h2>
            <p className="mt-3 text-sm leading-6 text-ink/62">
              Get fast answers from this event's schedule, tickets, speakers, and venue details.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.slice(0, 4).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleQuickQuestion(item)}
                className="rounded-full border border-ink/10 bg-sand/70 px-3 py-1.5 text-xs font-semibold text-ink/65 transition hover:border-reef/30 hover:text-reef"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {!user && (
            <div className="rounded-2xl border border-dusk/15 bg-dusk/5 px-4 py-3 text-sm text-dusk">
              <Link to="/auth" className="font-semibold underline-offset-4 hover:underline">
                Sign in
              </Link>{' '}
              to ask the event concierge personalized pre-booking questions.
            </div>
          )}

          <form onSubmit={askConcierge} className="space-y-3">
            <textarea
              value={question}
              onChange={(eventInput) => setQuestion(eventInput.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ask about sessions, ticket fit, venue, speaker lineup..."
              className="w-full resize-none rounded-2xl border border-ink/10 bg-sand/70 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-reef"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-ink/40">{question.length}/500</p>
              <button
                type="submit"
                disabled={!user || !question.trim() || busy}
                className="rounded-2xl bg-ink px-5 py-2.5 text-sm font-semibold text-sand transition disabled:cursor-not-allowed disabled:opacity-55"
              >
                {busy ? 'Thinking...' : 'Ask concierge'}
              </button>
            </div>
          </form>

          <div className="space-y-3">
            {history.length === 0 ? (
              <div className="rounded-2xl border border-ink/8 bg-sand/50 px-4 py-4 text-sm text-ink/55">
                Answers stay grounded in the event data, so vague details are called out instead of guessed.
              </div>
            ) : (
              history.map((item) => (
                <article key={item.id} className="rounded-2xl border border-ink/8 bg-sand/50 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/40">Question</p>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                        confidenceClasses[item.confidence] || confidenceClasses.medium
                      }`}
                    >
                      {item.confidence} confidence
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-ink">{item.question}</p>
                  <p className="mt-3 text-sm leading-6 text-ink/74">{item.answer}</p>
                  {item.supportingPoints.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.supportingPoints.map((point) => (
                        <span
                          key={point}
                          className="rounded-full border border-ink/10 bg-white/70 px-3 py-1 text-xs text-ink/55"
                        >
                          {point}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default EventConcierge;
