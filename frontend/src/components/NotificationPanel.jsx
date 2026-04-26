import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchNotifications, markNotificationRead } from '../features/notifications/notificationsSlice';
import { formatDate } from '../lib/formatters';

const NotificationPanel = () => {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { list, isOpen } = useSelector((state) => state.notifications);

  useEffect(() => {
    if (user && isOpen) {
      dispatch(fetchNotifications());
    }
  }, [dispatch, user, isOpen]);

  return (
    <aside
      className={`fixed right-4 top-20 z-40 w-[min(92vw,380px)] rounded-[28px] border border-ink/10 bg-white/95 p-5 shadow-bloom transition ${
        isOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-4 opacity-0'
      }`}
    >
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.28em] text-reef">Updates</p>
        <h3 className="mt-2 font-display text-2xl">Notifications</h3>
      </div>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto">
        {!list.length ? <p className="text-sm text-ink/65">New confirmations and reminders will show up here.</p> : null}
        {list.map((item) => (
          <div
            key={item._id}
            className={`w-full rounded-2xl border p-4 text-left transition ${
              item.readAt ? 'border-ink/8 bg-sand/50' : 'border-reef/30 bg-reef/5'
            }`}
          >
            <button
              type="button"
              onClick={() => dispatch(markNotificationRead(item._id))}
              className="w-full text-left"
            >
              <p className="font-semibold text-ink">{item.title}</p>
              <p className="mt-1 text-sm text-ink/70">{item.body}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-ink/45">{formatDate(item.createdAt)}</p>
            </button>

            {(item.metadata?.claimUrl || item.metadata?.ctaUrl) && (
              <a
                href={item.metadata.claimUrl || item.metadata.ctaUrl}
                onClick={() => dispatch(markNotificationRead(item._id))}
                className="mt-3 inline-flex rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-sand"
              >
                {item.metadata?.ctaLabel || 'Open'}
              </a>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
};

export default NotificationPanel;
