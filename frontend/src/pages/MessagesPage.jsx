import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '../lib/api';
import { createSocket } from '../lib/socket';
import { searchUsers, clearSearch } from '../features/user/userSlice';
import { formatDate } from '../lib/formatters';

// ─── helpers ──────────────────────────────────────────────────────────────────
const Avatar = ({ user, size = 'md' }) => {
  const dim = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  return (
    <div className={`${dim} rounded-full bg-gradient-to-br from-reef to-dusk flex-shrink-0 flex items-center justify-center text-sand font-semibold overflow-hidden`}>
      {user?.avatarUrl
        ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        : (user?.displayName || '?')[0].toUpperCase()}
    </div>
  );
};

// ─── component ────────────────────────────────────────────────────────────────
const MessagesPage = () => {
  const { userId: targetUserId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { searchResults } = useSelector((state) => state.user);

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeUserId, setActiveUserId] = useState(targetUserId || null);
  const [activeUser, setActiveUser] = useState(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [partnerProfiles, setPartnerProfiles] = useState({});   // userId → profile

  const socketRef = useRef(null);
  const bottomRef = useRef(null);

  // ── Fetch conversation list on mount ──────────────────────────────────────
  useEffect(() => {
    api.get('/api/chat/conversations')
      .then(async (res) => {
        const convos = res.data.data;
        setConversations(convos);

        // Eagerly resolve partner profiles
        const ids = [...new Set(convos.map((c) => c.partnerId))];
        const resolved = {};
        await Promise.allSettled(
          ids.map((id) =>
            api.get(`/api/users/profile/${id}`)
              .then((r) => { resolved[id] = r.data.data; })
              .catch(() => { resolved[id] = { displayName: id, userId: id }; })
          )
        );
        setPartnerProfiles(resolved);
      })
      .catch(() => setConversations([]));
  }, []);

  // ── Resolve profile of active user ───────────────────────────────────────
  useEffect(() => {
    if (!activeUserId) return;
    if (partnerProfiles[activeUserId]) {
      setActiveUser(partnerProfiles[activeUserId]);
      return;
    }
    api.get(`/api/users/profile/${activeUserId}`)
      .then((r) => {
        setActiveUser(r.data.data);
        setPartnerProfiles((prev) => ({ ...prev, [activeUserId]: r.data.data }));
      })
      .catch(() => setActiveUser({ displayName: activeUserId, userId: activeUserId }));
  }, [activeUserId, partnerProfiles]);

  // ── Socket connection ──────────────────────────────────────────────────────
  useEffect(() => {
    const socket = createSocket('/socket/chat');
    socketRef.current = socket;

    socket.on('chat:new-private-message', (message) => {
      const isRelevant =
        (message.senderId === user?.id && message.recipientId === activeUserId) ||
        (message.senderId === activeUserId && message.recipientId === user?.id);

      if (isRelevant) {
        setMessages((prev) => [...prev, message]);
      }

      // Refresh conversation list so last-message updates
      setConversations((prev) => {
        const roomId = [message.senderId, message.recipientId].sort().join(':');
        const exists = prev.find((c) => c.roomId === roomId);
        const updated = {
          roomId,
          partnerId: message.senderId === user?.id ? message.recipientId : message.senderId,
          lastMessage: {
            body: message.body,
            senderId: message.senderId,
            createdAt: message.createdAt
          }
        };
        if (exists) {
          return [updated, ...prev.filter((c) => c.roomId !== roomId)];
        }
        return [updated, ...prev];
      });
    });

    socket.on('chat:error', ({ message: msg }) => {
      console.error('Chat error:', msg);
    });

    return () => socket.disconnect();
  }, [user, activeUserId]);

  // ── Load messages when active user changes ────────────────────────────────
  useEffect(() => {
    if (!activeUserId) return;
    setLoadingMessages(true);
    socketRef.current?.emit('chat:join-private', { participantId: activeUserId });

    api.get(`/api/chat/private/${activeUserId}`)
      .then((res) => setMessages(res.data.data))
      .catch(() => setMessages([]))
      .finally(() => setLoadingMessages(false));
  }, [activeUserId]);

  // ── Scroll to bottom ──────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Search debounce ───────────────────────────────────────────────────────
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      dispatch(clearSearch());
      return;
    }
    const timer = setTimeout(() => dispatch(searchUsers(searchQuery)), 350);
    return () => clearTimeout(timer);
  }, [searchQuery, dispatch]);

  const selectUser = useCallback((uid, profile) => {
    setActiveUserId(uid);
    setActiveUser(profile);
    setSearchQuery('');
    dispatch(clearSearch());
    navigate(`/messages/${uid}`, { replace: true });
  }, [dispatch, navigate]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!draft.trim() || !activeUserId) return;
    socketRef.current?.emit('chat:send-private-message', {
      recipientId: activeUserId,
      body: draft.trim()
    });
    setDraft('');
  };

  const isShowingSearch = searchResults.length > 0 && searchQuery.trim().length >= 2;

  return (
    <div className="flex h-[calc(100vh-10rem)] overflow-hidden rounded-[32px] border border-ink/10 bg-white/80 shadow-bloom">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="flex w-72 flex-shrink-0 flex-col border-r border-ink/10">
        <div className="border-b border-ink/10 p-4">
          <p className="font-display text-xl text-ink">Messages</p>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search people..."
            className="mt-3 w-full rounded-2xl border border-ink/10 bg-sand px-3 py-2 text-sm outline-none focus:border-reef"
          />
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Search results */}
          {isShowingSearch && (
            <div className="p-2">
              <p className="px-3 py-1 text-xs uppercase tracking-[0.2em] text-ink/40">Results</p>
              {searchResults.map((result) => (
                <button
                  key={result.userId}
                  type="button"
                  onClick={() => selectUser(result.userId, result)}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-sand/60 flex items-center gap-2"
                >
                  <Avatar user={result} size="sm" />
                  <div className="min-w-0">
                    <p className="font-medium text-ink truncate">{result.displayName}</p>
                    <p className="text-xs text-ink/45 capitalize">{result.role}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Conversation history */}
          {!isShowingSearch && (
            <div className="p-2">
              {conversations.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-ink/40">
                  No conversations yet.<br />Search for someone to start chatting.
                </p>
              )}
              {conversations.map((convo) => {
                const partner = partnerProfiles[convo.partnerId];
                const isActive = convo.partnerId === activeUserId;
                const isOwn = convo.lastMessage?.senderId === user?.id;
                return (
                  <button
                    key={convo.roomId}
                    type="button"
                    onClick={() => selectUser(convo.partnerId, partner)}
                    className={`w-full rounded-xl px-3 py-3 text-left transition flex items-center gap-3 ${isActive ? 'bg-reef/10 border border-reef/20' : 'hover:bg-sand/60'}`}
                  >
                    <Avatar user={partner} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-ink text-sm truncate">
                        {partner?.displayName || convo.partnerId}
                      </p>
                      {convo.lastMessage && (
                        <p className="text-xs text-ink/50 truncate">
                          {isOwn ? 'You: ' : ''}{convo.lastMessage.body}
                        </p>
                      )}
                    </div>
                    {convo.lastMessage?.createdAt && (
                      <p className="text-[10px] text-ink/35 flex-shrink-0">
                        {new Date(convo.lastMessage.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* ── Chat area ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col">
        {activeUserId ? (
          <>
            {/* Header */}
            <div className="border-b border-ink/10 px-5 py-4 flex items-center gap-3">
              <Avatar user={activeUser} />
              <div>
                <p className="font-semibold text-ink">
                  {activeUser?.displayName || 'Private conversation'}
                </p>
                <p className="text-xs text-ink/45 capitalize">
                  {activeUser?.role || 'user'}{activeUser?.verifiedOrganizer ? ' · Verified' : ''}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {loadingMessages && (
                <div className="flex items-center justify-center py-8">
                  <div className="h-5 w-5 rounded-full border-2 border-reef border-t-transparent animate-spin" />
                </div>
              )}
              {!loadingMessages && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="h-12 w-12 rounded-full bg-reef/10 flex items-center justify-center mb-3">
                    <svg className="h-6 w-6 text-reef" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <p className="text-sm text-ink/50">No messages yet. Say hello!</p>
                </div>
              )}
              {messages.map((msg) => {
                const isMine = msg.senderId === user?.id;
                return (
                  <div key={msg._id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${isMine ? 'bg-ink text-sand' : 'bg-sand/80 text-ink'}`}>
                      <p className="text-sm leading-relaxed">{msg.body}</p>
                      <p className={`mt-1 text-[10px] ${isMine ? 'text-sand/50' : 'text-ink/40'}`}>
                        {formatDate(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Composer */}
            <form onSubmit={sendMessage} className="border-t border-ink/10 p-4 flex gap-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { sendMessage(e); } }}
                placeholder="Type a message..."
                className="flex-1 rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm outline-none focus:border-reef"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                className="rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-sand disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center px-8">
            <div className="rounded-full bg-reef/10 p-6">
              <svg className="h-10 w-10 text-reef" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="mt-4 font-display text-2xl text-ink">Private messages</p>
            <p className="mt-2 max-w-xs text-sm text-ink/60">
              Select a conversation from the list, or search for someone to start chatting.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessagesPage;