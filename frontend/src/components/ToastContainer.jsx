import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { dismissToast } from '../features/ui/uiSlice';

const TONE_STYLES = {
  success: {
    bg: 'bg-reef/95',
    icon: (
      <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    ),
    text: 'text-white'
  },
  error: {
    bg: 'bg-ember/95',
    icon: (
      <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    text: 'text-white'
  },
  warning: {
    bg: 'bg-amber-500/95',
    icon: (
      <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
    text: 'text-white'
  },
  info: {
    bg: 'bg-dusk/95',
    icon: (
      <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    text: 'text-white'
  }
};

const Toast = ({ toast }) => {
  const dispatch = useDispatch();
  const timerRef = useRef(null);
  const style = TONE_STYLES[toast.tone] || TONE_STYLES.info;

  useEffect(() => {
    if (toast.duration > 0) {
      timerRef.current = setTimeout(() => {
        dispatch(dismissToast(toast.id));
      }, toast.duration);
    }
    return () => clearTimeout(timerRef.current);
  }, [toast.id, toast.duration, dispatch]);

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 shadow-bloom backdrop-blur ${style.bg} ${style.text} animate-slide-in`}
      style={{ minWidth: '260px', maxWidth: '420px' }}
      role="alert"
    >
      {style.icon}
      <p className="flex-1 text-sm font-medium leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={() => dispatch(dismissToast(toast.id))}
        className="ml-1 flex-shrink-0 rounded-full p-1 opacity-70 hover:opacity-100 transition"
        aria-label="Dismiss"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

/**
 * ToastContainer
 * Mount this once inside AppShell (after <NotificationPanel />).
 * It reads from Redux state and stacks toasts bottom-right.
 */
const ToastContainer = () => {
  const toasts = useSelector((state) => state.ui?.toasts ?? []);

  if (!toasts.length) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-[60] flex flex-col-reverse gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
};

export default ToastContainer;

/*
 * ─── Tailwind animation ───────────────────────────────────────────────────────
 * Add the following to your tailwind.config.js → theme.extend:
 *
 *   animation: {
 *     'slide-in': 'slideIn 0.22s ease-out'
 *   },
 *   keyframes: {
 *     slideIn: {
 *       from: { opacity: '0', transform: 'translateY(12px) scale(0.96)' },
 *       to:   { opacity: '1', transform: 'translateY(0) scale(1)' }
 *     }
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */