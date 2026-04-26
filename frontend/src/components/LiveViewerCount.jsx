import { useEffect, useRef, useState } from 'react';

/**
 * LiveViewerCount
 * Listens to the already-connected liveSocket for stream:status events
 * and renders an animated viewer count badge.
 *
 * Props:
 *   socket   – Socket.IO socket instance (the liveSocket from LiveEventPage)
 *   eventId  – string
 */
const LiveViewerCount = ({ socket, eventId }) => {
  const [count, setCount] = useState(0);
  const [bump, setBump] = useState(false);
  const prevRef = useRef(0);

  useEffect(() => {
    if (!socket) return;

    const handleStatus = (session) => {
      if (session.eventId !== eventId) return;
      const next = session.viewerCount ?? 0;
      if (next !== prevRef.current) {
        prevRef.current = next;
        setCount(next);
        setBump(true);
        setTimeout(() => setBump(false), 500);
      }
    };

    socket.on('stream:status', handleStatus);
    return () => socket.off('stream:status', handleStatus);
  }, [socket, eventId]);

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full border border-ink/10 bg-white/80 px-3 py-1.5 text-xs font-semibold text-ink shadow-bloom transition-transform ${
        bump ? 'scale-110' : 'scale-100'
      }`}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-reef opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-reef" />
      </span>
      {count} {count === 1 ? 'viewer' : 'viewers'}
    </div>
  );
};

export default LiveViewerCount;