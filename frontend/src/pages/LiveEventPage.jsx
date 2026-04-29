import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { api } from '../lib/api';
import { createSocket } from '../lib/socket';
import { formatDate } from '../lib/formatters';
import LiveStreamStage from '../components/LiveStreamStage';
import LiveSponsorsPanel from '../components/LiveSponsorsPanel';
import LiveViewerCount from '../components/LiveViewerCount';   // ← NEW

const REACTION_EMOJIS = ['🔥', '👏', '❤️', '🚀', '😂', '🤯'];

const getBadgeClasses = (badge) => {
  if (badge === 'Speaker') {
    return 'bg-dusk/10 text-dusk';
  }
  if (badge) {
    return 'bg-reef/10 text-reef';
  }
  return 'bg-ink/8 text-ink/45';
};

const QuestionAuthor = ({ author }) => (
  <div className="flex flex-wrap items-center gap-2">
    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">
      {author?.name || 'Attendee'}
    </span>
    {author?.badge && (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${getBadgeClasses(author.badge)}`}>
        {author.badge}
      </span>
    )}
  </div>
);

const ReplyComposer = ({
  value,
  onChange,
  onSubmit,
  onCancel,
  busy,
  placeholder = 'Write a reply...'
}) => (
  <form onSubmit={onSubmit} className="mt-3 space-y-2 rounded-2xl border border-ink/8 bg-white/80 p-3">
    <textarea
      aria-label={placeholder}
      value={value}
      onChange={(eventInput) => onChange(eventInput.target.value)}
      rows={2}
      placeholder={placeholder}
      className="w-full rounded-xl border border-ink/10 bg-sand px-3 py-2 text-sm outline-none focus:border-reef"
    />
    <div className="flex flex-wrap gap-2">
      <button
        type="submit"
        disabled={!value.trim() || busy}
        className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-sand disabled:opacity-60"
      >
        {busy ? 'Posting...' : 'Post reply'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink/55"
      >
        Cancel
      </button>
    </div>
  </form>
);

const ReplyThread = ({
  questionId,
  replies = [],
  replyDrafts,
  setReplyDrafts,
  replyingTo,
  setReplyingTo,
  submittingReplyId,
  onSubmitReply,
  depth = 0
}) => (
  <div className={depth ? 'mt-3 space-y-3 pl-4' : 'mt-4 space-y-3'}>
    {replies.map((reply) => {
      const replyKey = reply.replyId;
      const isReplying = replyingTo === replyKey;
      return (
        <div key={replyKey} className="border-l border-ink/10 pl-3">
          <QuestionAuthor author={reply.author} />
          <p className="mt-1 text-sm leading-relaxed text-ink/75">{reply.body}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setReplyingTo(isReplying ? null : replyKey)}
              className="rounded-full border border-ink/10 bg-white px-2.5 py-1 text-xs font-semibold text-ink/55 hover:border-reef/30 hover:text-reef"
            >
              Reply
            </button>
            <span className="text-xs text-ink/30">{formatDate(reply.createdAt)}</span>
          </div>
          {isReplying && (
            <ReplyComposer
              value={replyDrafts[replyKey] || ''}
              onChange={(value) => setReplyDrafts((current) => ({ ...current, [replyKey]: value }))}
              onSubmit={(eventInput) => onSubmitReply(eventInput, questionId, replyKey)}
              onCancel={() => setReplyingTo(null)}
              busy={submittingReplyId === replyKey}
              placeholder="Reply in this thread..."
            />
          )}
          {reply.replies?.length > 0 && (
            <ReplyThread
              questionId={questionId}
              replies={reply.replies}
              replyDrafts={replyDrafts}
              setReplyDrafts={setReplyDrafts}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              submittingReplyId={submittingReplyId}
              onSubmitReply={onSubmitReply}
              depth={depth + 1}
            />
          )}
        </div>
      );
    })}
  </div>
);

const LiveEventPage = () => {
  const { eventId } = useParams();
  const { user } = useSelector((state) => state.auth);
  const [event, setEvent] = useState(null);
  const [messages, setMessages] = useState([]);
  const [polls, setPolls] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [chatMessage, setChatMessage] = useState('');
  const [questionBody, setQuestionBody] = useState('');
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replyingTo, setReplyingTo] = useState(null);
  const [submittingReplyId, setSubmittingReplyId] = useState(null);
  const [qaError, setQaError] = useState(null);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState('Yes,No');
  const [announcement, setAnnouncement] = useState('');
  const [assistantQuestion, setAssistantQuestion] = useState('');
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantHistory, setAssistantHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('polls');
  const [chatError, setChatError] = useState(null);
  const [chatSocket, setChatSocket] = useState(null);
  const [liveSocket, setLiveSocket] = useState(null);
  const chatBottomRef = useRef(null);

  const canManage = useMemo(
    () =>
      Boolean(
        user &&
          (['moderator', 'admin'].includes(user.role) ||
            (user.role === 'organizer' && event?.organizerId === user.id))
      ),
    [event?.organizerId, user]
  );
  const canBroadcast = Boolean(
    user &&
    event &&
    (user.role === 'admin' || event.organizerId === user.id)
  );

  const upsertQuestion = (nextQuestion) => {
    setQuestions((current) => {
      const exists = current.some((question) => question._id === nextQuestion._id);
      return exists
        ? current.map((question) => (question._id === nextQuestion._id ? nextQuestion : question))
        : [nextQuestion, ...current];
    });
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [eventRes, chatRes, pollsRes, questionsRes, reactionsRes] = await Promise.all([
          api.get(`/api/events/${eventId}`),
          api.get(`/api/chat/event/${eventId}/messages`),
          api.get(`/api/live/${eventId}/polls`),
          api.get(`/api/live/${eventId}/questions`),
          api.get(`/api/live/${eventId}/reactions`)
        ]);
        setEvent(eventRes.data.data);
        setMessages(chatRes.data.data);
        setPolls(pollsRes.data.data);
        setQuestions(questionsRes.data.data);
        setReactions(reactionsRes.data.data);
      } catch (error) {
        console.error('Failed to load live event data:', error);
      }
    };
    load();
  }, [eventId]);

  useEffect(() => {
    if (messages.length) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    const nextChatSocket = createSocket('/socket/chat');
    const nextLiveSocket = createSocket('/socket/live');
    setChatSocket(nextChatSocket);
    setLiveSocket(nextLiveSocket);

    nextChatSocket.emit('chat:join-event', { eventId });
    nextLiveSocket.emit('live:join', { eventId });

    const handleNewMessage = (message) => setMessages((current) => [...current, message]);
    const handleDeletedMessage = ({ messageId }) =>
      setMessages((current) => current.filter((message) => message._id !== messageId));
    const handleChatError = ({ message }) => {
      setChatError(message);
      setTimeout(() => setChatError(null), 4000);
    };
    const handlePollCreated = (poll) => setPolls((current) => [poll, ...current]);
    const handlePollUpdated = (poll) =>
      setPolls((current) => current.map((item) => (item._id === poll._id ? poll : item)));
    const handleQuestionCreated = (question) => setQuestions((current) => [question, ...current]);
    const handleQuestionUpdated = (question) =>
      setQuestions((current) => {
        const exists = current.some((item) => item._id === question._id);
        return exists
          ? current.map((item) => (item._id === question._id ? question : item))
          : [question, ...current];
      });
    const handleAnnouncement = (payload) => {
      setQuestions((current) => [
        {
          _id: `ann-${payload._id}`,
          body: `Announcement: ${payload.body}`,
          createdAt: payload.createdAt,
          answered: true,
          upvotes: 0,
          isAnnouncement: true
        },
        ...current
      ]);
    };
    const handleReaction = (reaction) => {
      setReactions((current) => {
        const exists = current.find((item) => item.emoji === reaction.emoji);
        if (!exists) return [...current, reaction];
        return current.map((item) => (item.emoji === reaction.emoji ? reaction : item));
      });
    };

    nextChatSocket.on('chat:new-message', handleNewMessage);
    nextChatSocket.on('chat:message-deleted', handleDeletedMessage);
    nextChatSocket.on('chat:error', handleChatError);
    nextLiveSocket.on('live:poll-created', handlePollCreated);
    nextLiveSocket.on('live:poll-updated', handlePollUpdated);
    nextLiveSocket.on('live:question-created', handleQuestionCreated);
    nextLiveSocket.on('live:question-updated', handleQuestionUpdated);
    nextLiveSocket.on('live:announcement', handleAnnouncement);
    nextLiveSocket.on('live:reaction', handleReaction);

    return () => {
      nextChatSocket.off('chat:new-message', handleNewMessage);
      nextChatSocket.off('chat:message-deleted', handleDeletedMessage);
      nextChatSocket.off('chat:error', handleChatError);
      nextLiveSocket.off('live:poll-created', handlePollCreated);
      nextLiveSocket.off('live:poll-updated', handlePollUpdated);
      nextLiveSocket.off('live:question-created', handleQuestionCreated);
      nextLiveSocket.off('live:question-updated', handleQuestionUpdated);
      nextLiveSocket.off('live:announcement', handleAnnouncement);
      nextLiveSocket.off('live:reaction', handleReaction);
      nextChatSocket.disconnect();
      nextLiveSocket.disconnect();
      setChatSocket(null);
      setLiveSocket(null);
    };
  }, [eventId]);

  const sendMessage = async (eventInput) => {
    eventInput.preventDefault();
    if (!chatMessage.trim()) return;
    await api.post(`/api/chat/event/${eventId}/messages`, { body: chatMessage });
    setChatMessage('');
  };

  const submitQuestion = async (eventInput) => {
    eventInput.preventDefault();
    if (!questionBody.trim()) return;
    await api.post(`/api/live/${eventId}/questions`, { body: questionBody });
    setQuestionBody('');
  };

  const submitQuestionReply = async (eventInput, questionId, parentReplyId = null) => {
    eventInput.preventDefault();
    const draftKey = parentReplyId || questionId;
    const body = (replyDrafts[draftKey] || '').trim();
    if (!body) return;

    setSubmittingReplyId(draftKey);
    setQaError(null);
    try {
      const response = await api.post(`/api/live/questions/${questionId}/replies`, {
        body,
        parentReplyId: parentReplyId || undefined
      });
      upsertQuestion(response.data.data);
      setReplyDrafts((current) => {
        const next = { ...current };
        delete next[draftKey];
        return next;
      });
      setReplyingTo(null);
    } catch (error) {
      setQaError(error.response?.data?.message || 'Unable to post that reply.');
    } finally {
      setSubmittingReplyId(null);
    }
  };

  const updateQuestionStatus = async (questionId, payload) => {
    setQaError(null);
    try {
      const response = await api.patch(`/api/live/questions/${questionId}`, payload);
      upsertQuestion(response.data.data);
    } catch (error) {
      setQaError(error.response?.data?.message || 'Unable to update that question.');
    }
  };

  const createPoll = async (eventInput) => {
    eventInput.preventDefault();
    if (!pollQuestion.trim()) return;
    await api.post(`/api/live/${eventId}/polls`, {
      question: pollQuestion,
      options: pollOptions
        .split(',')
        .map((option, index) => ({ id: `opt-${index + 1}`, label: option.trim() }))
        .filter((option) => option.label)
    });
    setPollQuestion('');
    setPollOptions('Yes,No');
  };

  const votePoll = async (pollId, optionId) => {
    try {
      await api.post(`/api/live/polls/${pollId}/vote`, { optionId });
    } catch { /* duplicate vote — ignore */ }
  };

  const upvoteQuestion = async (questionId) => {
    try {
      const response = await api.post(`/api/live/questions/${questionId}/upvote`);
      setQuestions((current) =>
        current.map((question) => (question._id === questionId ? response.data.data : question))
      );
    } catch { /* already voted — ignore */ }
  };

  const postAnnouncement = async (eventInput) => {
    eventInput.preventDefault();
    if (!announcement.trim()) return;
    await api.post(`/api/live/${eventId}/announcements`, { body: announcement });
    setAnnouncement('');
  };

  const askAssistant = async (eventInput) => {
    eventInput.preventDefault();
    if (!assistantQuestion.trim()) return;
    setAssistantBusy(true);
    try {
      const question = assistantQuestion;
      const response = await api.post(`/api/events/${eventId}/assistant/ask`, { question });
      setAssistantHistory((current) => [
        {
          id: Date.now(),
          question,
          answer: response.data.data.answer,
          supportingPoints: response.data.data.supportingPoints,
          confidence: response.data.data.confidence
        },
        ...current
      ].slice(0, 6));
      setAssistantQuestion('');
    } catch (error) {
      setAssistantHistory((current) => [
        {
          id: Date.now(),
          question: assistantQuestion,
          answer: error.response?.data?.message || 'The AI assistant could not answer that right now.',
          supportingPoints: [],
          confidence: 'low'
        },
        ...current
      ].slice(0, 6));
    } finally {
      setAssistantBusy(false);
    }
  };

  const react = (emoji) => {
    liveSocket?.emit('live:react', { eventId, emoji });
  };

  const totalReactions = reactions.reduce((sum, reaction) => sum + reaction.count, 0);
  const orderedQuestions = useMemo(
    () =>
      [...questions].sort((left, right) => {
        if (Boolean(left.pinned) !== Boolean(right.pinned)) {
          return Number(right.pinned) - Number(left.pinned);
        }
        if (Boolean(left.isAnnouncement) !== Boolean(right.isAnnouncement)) {
          return Number(right.isAnnouncement) - Number(left.isAnnouncement);
        }
        if (Boolean(left.answered) !== Boolean(right.answered)) {
          return Number(left.answered) - Number(right.answered);
        }
        if (Number(left.upvotes || 0) !== Number(right.upvotes || 0)) {
          return Number(right.upvotes || 0) - Number(left.upvotes || 0);
        }
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }),
    [questions]
  );

  return (
    <div className="space-y-6">
      {/* ── Live header bar ── */}
      <section className="rounded-[32px] border border-ink/10 bg-white/80 p-5 shadow-bloom">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ember opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-ember" />
              </span>
              <p className="text-xs uppercase tracking-[0.3em] text-ember font-semibold">Live Now</p>
            </div>
            <h1 className="mt-2 font-display text-3xl text-ink md:text-4xl">
              {event?.title || 'Loading...'}
            </h1>
            {event && (
              <p className="mt-1 text-sm text-ink/60">{formatDate(event.startsAt)}</p>
            )}
          </div>

          {/* ── RIGHT: viewer count badge + total reaction count ── */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {/* Live viewer count — updates in realtime via stream:status socket event */}
            <LiveViewerCount socket={liveSocket} eventId={eventId} />   {/* ← NEW */}

            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Reactions</p>
              <p className="font-display text-2xl text-ink">{totalReactions}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {REACTION_EMOJIS.map((emoji) => {
            const count = reactions.find((reaction) => reaction.emoji === emoji)?.count || 0;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => react(emoji)}
                className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-sand/80 px-3 py-2 text-sm hover:bg-white hover:border-ink/20 transition"
              >
                <span className="text-base">{emoji}</span>
                {count > 0 && <span className="font-semibold text-ink/60 text-xs">{count}</span>}
              </button>
            );
          })}
        </div>
      </section>

      <LiveStreamStage eventId={eventId} socket={liveSocket} canBroadcast={canBroadcast} />

      <section className="grid gap-5 xl:grid-cols-[1fr,1.15fr,0.9fr]">
        {/* ── Chat ── */}
        <div className="flex flex-col rounded-[28px] border border-ink/10 bg-white/80 shadow-bloom overflow-hidden">
          <div className="border-b border-ink/8 px-5 py-4">
            <h2 className="font-display text-2xl">Chat</h2>
            <p className="text-xs text-ink/45 mt-0.5">{messages.length} messages</p>
          </div>

          <div className="flex-1 min-h-0 max-h-[420px] overflow-y-auto p-4 space-y-3">
            {!messages.length && (
              <p className="text-sm text-ink/45 text-center py-6">Be the first to say hello.</p>
            )}
            {messages.map((message) => (
              <div key={message._id} className="rounded-2xl bg-sand/70 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-reef font-semibold">
                  {message.senderRole || 'participant'}
                </p>
                <p className="mt-1 text-sm text-ink">{message.body}</p>
                <p className="mt-1 text-xs text-ink/35">{formatDate(message.createdAt)}</p>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {chatError && (
            <p className="px-5 py-2 text-xs text-ember bg-ember/5 border-t border-ember/10">
              {chatError}
            </p>
          )}

          <form onSubmit={sendMessage} className="border-t border-ink/8 p-4 flex gap-2">
            <input
              value={chatMessage}
              onChange={(eventInput) => setChatMessage(eventInput.target.value)}
              placeholder="Say something..."
              className="flex-1 rounded-2xl border border-ink/10 bg-sand px-4 py-2.5 text-sm outline-none focus:border-reef"
            />
            <button type="submit" className="rounded-2xl bg-ink px-4 py-2.5 text-sm font-semibold text-sand">
              Send
            </button>
          </form>
        </div>

        {/* ── Polls + Q&A ── */}
        <div className="rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-bloom space-y-5">
          <div className="inline-flex rounded-full border border-ink/10 bg-sand p-1 gap-1">
            {[
              { key: 'polls', label: 'Polls' },
              {
                key: 'qa',
                label: `Q&A ${
                  questions.filter((question) => !question.answered && !question.isAnnouncement).length
                    ? `(${questions.filter((question) => !question.answered && !question.isAnnouncement).length})`
                    : ''
                }`
              }
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  activeTab === key ? 'bg-ink text-sand' : 'text-ink/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'polls' && (
            <div className="space-y-4">
              {canManage && (
                <form onSubmit={createPoll} className="space-y-3 rounded-2xl bg-sand p-4">
                  <p className="text-sm font-semibold text-ink">Launch a poll</p>
                  <input
                    value={pollQuestion}
                    onChange={(eventInput) => setPollQuestion(eventInput.target.value)}
                    placeholder="Poll question"
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-reef"
                  />
                  <input
                    value={pollOptions}
                    onChange={(eventInput) => setPollOptions(eventInput.target.value)}
                    placeholder="Options (comma-separated)"
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-reef"
                  />
                  <button type="submit" className="rounded-2xl bg-ink px-4 py-2.5 text-sm font-semibold text-sand">
                    Publish poll
                  </button>
                </form>
              )}

              {!polls.length && <p className="text-sm text-ink/45 text-center py-4">No polls yet.</p>}

              {polls.map((poll) => {
                const totalVotes = poll.options.reduce((sum, option) => sum + option.votes, 0);
                const isClosed = poll.status === 'closed';
                return (
                  <div key={poll._id} className={`rounded-2xl border p-4 ${isClosed ? 'border-ink/8 bg-sand/40' : 'border-ink/10 bg-sand/60'}`}>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <p className="font-semibold text-ink">{poll.question}</p>
                      {isClosed && (
                        <span className="rounded-full bg-ink/8 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-ink/50 flex-shrink-0">
                          Closed
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {poll.options.map((option) => {
                        const percentage = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => !isClosed && votePoll(poll._id, option.id)}
                            disabled={isClosed}
                            className="relative w-full overflow-hidden rounded-xl bg-white text-left disabled:cursor-default"
                          >
                            <div
                              className="absolute inset-y-0 left-0 bg-reef/10 transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            />
                            <div className="relative flex items-center justify-between px-4 py-2.5">
                              <span className="text-sm text-ink">{option.label}</span>
                              <span className="text-xs font-semibold text-reef">{percentage}%</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-ink/40">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'qa' && (
            <div className="space-y-4">
              <form onSubmit={submitQuestion} className="space-y-3 rounded-2xl bg-sand p-4">
                <textarea
                  value={questionBody}
                  onChange={(eventInput) => setQuestionBody(eventInput.target.value)}
                  rows={3}
                  placeholder="Ask the stage team a question..."
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                />
                <button type="submit" className="rounded-2xl bg-dusk px-4 py-2.5 text-sm font-semibold text-sand">
                  Submit question
                </button>
              </form>

              {!questions.length && <p className="text-sm text-ink/45 text-center py-4">No questions yet.</p>}

              {qaError && (
                <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{qaError}</p>
              )}

              {orderedQuestions.map((question) => {
                const questionReplying = replyingTo === question._id;
                return (
                <div
                  key={question._id}
                  className={`rounded-2xl border p-4 ${
                    question.isAnnouncement
                      ? 'border-ember/20 bg-ember/5'
                      : question.pinned
                        ? 'border-dusk/25 bg-dusk/5'
                        : 'border-ink/8 bg-sand/60'
                  }`}
                >
                  {!question.isAnnouncement && <QuestionAuthor author={question.author} />}
                  <p className="text-sm text-ink leading-relaxed">{question.body}</p>
                  <div className="mt-2 flex items-center gap-3 flex-wrap">
                    {question.pinned && (
                      <span className="rounded-full bg-dusk/10 px-2 py-0.5 text-xs font-semibold text-dusk">
                        Pinned
                      </span>
                    )}
                    {question.answered && !question.isAnnouncement && (
                      <span className="rounded-full bg-reef/10 px-2 py-0.5 text-xs font-semibold text-reef">
                        Answered
                      </span>
                    )}
                    {!question.answered && !question.isAnnouncement && (
                      <button
                        type="button"
                        onClick={() => upvoteQuestion(question._id)}
                        className="flex items-center gap-1 rounded-full border border-ink/10 bg-white/80 px-2.5 py-1 text-xs text-ink/60 hover:border-reef/30 hover:text-reef transition"
                      >
                        ▲ {question.upvotes || 0}
                        </button>
                      )}
                    {!question.isAnnouncement && (
                      <button
                        type="button"
                        onClick={() => setReplyingTo(questionReplying ? null : question._id)}
                        className="rounded-full border border-ink/10 bg-white/80 px-2.5 py-1 text-xs font-semibold text-ink/60 hover:border-reef/30 hover:text-reef transition"
                      >
                        Reply{question.replyCount ? ` (${question.replyCount})` : ''}
                      </button>
                    )}
                    {canManage && !question.isAnnouncement && (
                      <>
                        <button
                          type="button"
                          onClick={() => updateQuestionStatus(question._id, { answered: !question.answered })}
                          className="rounded-full border border-ink/10 bg-white/80 px-2.5 py-1 text-xs font-semibold text-ink/60 hover:border-reef/30 hover:text-reef transition"
                        >
                          {question.answered ? 'Mark unresolved' : 'Mark answered'}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateQuestionStatus(question._id, { pinned: !question.pinned })}
                          disabled={!question.answered}
                          className="rounded-full border border-dusk/20 bg-white/80 px-2.5 py-1 text-xs font-semibold text-dusk disabled:opacity-40"
                        >
                          {question.pinned ? 'Unpin' : 'Pin'}
                        </button>
                      </>
                    )}
                    <span className="text-xs text-ink/30">{formatDate(question.createdAt)}</span>
                  </div>
                  {questionReplying && (
                    <ReplyComposer
                      value={replyDrafts[question._id] || ''}
                      onChange={(value) => setReplyDrafts((current) => ({ ...current, [question._id]: value }))}
                      onSubmit={(eventInput) => submitQuestionReply(eventInput, question._id)}
                      onCancel={() => setReplyingTo(null)}
                      busy={submittingReplyId === question._id}
                      placeholder="Reply to this question..."
                    />
                  )}
                  {!question.isAnnouncement && question.replies?.length > 0 && (
                    <ReplyThread
                      questionId={question._id}
                      replies={question.replies}
                      replyDrafts={replyDrafts}
                      setReplyDrafts={setReplyDrafts}
                      replyingTo={replyingTo}
                      setReplyingTo={setReplyingTo}
                      submittingReplyId={submittingReplyId}
                      onSubmitReply={submitQuestionReply}
                    />
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── AI assistant + reactions + announcements ── */}
        <div className="space-y-4 rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-bloom">
          <LiveSponsorsPanel eventId={eventId} sponsors={event?.sponsors || []} />

          <div className="rounded-2xl bg-sand/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-ink/45 mb-3">AI attendee assistant</p>
            <form onSubmit={askAssistant} className="space-y-3">
              <textarea
                value={assistantQuestion}
                onChange={(eventInput) => setAssistantQuestion(eventInput.target.value)}
                rows={3}
                placeholder="What should attendees know about this event?"
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
              />
              <button
                type="submit"
                disabled={assistantBusy}
                className="w-full rounded-2xl bg-ink px-4 py-2.5 text-sm font-semibold text-sand disabled:opacity-60"
              >
                {assistantBusy ? 'Thinking...' : 'Ask AI assistant'}
              </button>
            </form>
            <div className="mt-4 space-y-3">
              {assistantHistory.length === 0 && (
                <p className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-ink/55">
                  Attendees can ask schedule, speaker, location, and ticket questions here.
                </p>
              )}
              {assistantHistory.map((item) => (
                <div key={item.id} className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-ink/40">Question</p>
                  <p className="mt-1 text-sm text-ink">{item.question}</p>
                  <p className="mt-3 text-xs uppercase tracking-[0.18em] text-ink/40">
                    Answer · {item.confidence} confidence
                  </p>
                  <p className="mt-1 text-sm text-ink/75">{item.answer}</p>
                  {item.supportingPoints?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.supportingPoints.map((point) => (
                        <span key={point} className="rounded-full border border-ink/10 bg-sand px-3 py-1 text-xs text-ink/55">
                          {point}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-sand/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-ink/45 mb-3">Live reactions</p>
            <div className="grid grid-cols-3 gap-2">
              {REACTION_EMOJIS.map((emoji) => {
                const count = reactions.find((reaction) => reaction.emoji === emoji)?.count || 0;
                return (
                  <div key={emoji} className="flex flex-col items-center gap-1 rounded-xl bg-white px-2 py-3">
                    <span className="text-xl">{emoji}</span>
                    <span className="text-xs font-semibold text-ink">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {canManage ? (
            <form onSubmit={postAnnouncement} className="space-y-3 rounded-2xl bg-sand p-4">
              <p className="text-sm font-semibold text-ink">Broadcast announcement</p>
              <textarea
                value={announcement}
                onChange={(eventInput) => setAnnouncement(eventInput.target.value)}
                rows={3}
                placeholder="Message to all attendees..."
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-ember"
              />
              <button type="submit" className="w-full rounded-2xl bg-ember px-4 py-2.5 text-sm font-semibold text-white">
                Send to all
              </button>
            </form>
          ) : (
            <div className="rounded-2xl bg-sand/60 p-4 text-sm text-ink/60">
              Moderator controls are available to organizers, moderators, and admins.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default LiveEventPage;
