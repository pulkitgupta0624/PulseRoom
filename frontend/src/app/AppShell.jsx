import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useEffect, useRef, useState } from 'react';
import NotificationPanel from '../components/NotificationPanel';
import { bootstrapSession, logout } from '../features/auth/authSlice';
import PwaInstallPrompt from '../components/PwaInstallPrompt';
import {
  fetchNotifications,
  fetchUnreadCount,
  toggleNotifications
} from '../features/notifications/notificationsSlice';
import ToastContainer from '../components/ToastContainer';
import { showToast, toggleTheme } from '../features/ui/uiSlice';

const AppShell = () => {
  const theme = useSelector((state) => state.ui.theme);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const { unreadCount, isOpen: notificationsOpen } = useSelector((state) => state.notifications);
  const [mobileOpen, setMobileOpen] = useState(false);
  const previousUnreadCountRef = useRef(null);

  useEffect(() => { dispatch(bootstrapSession()); }, [dispatch]);
  useEffect(() => {
    if (!user) {
      previousUnreadCountRef.current = null;
      return undefined;
    }

    let isActive = true;

    const syncNotifications = async ({ allowToast = false } = {}) => {
      try {
        const nextUnreadCount = await dispatch(fetchUnreadCount()).unwrap();
        if (!isActive) {
          return;
        }

        const previousUnreadCount = previousUnreadCountRef.current;
        if (
          allowToast &&
          previousUnreadCount !== null &&
          nextUnreadCount > previousUnreadCount
        ) {
          const nextNotificationCount = nextUnreadCount - previousUnreadCount;
          dispatch(showToast({
            message:
              nextNotificationCount === 1
                ? '1 new update is waiting in your inbox.'
                : `${nextNotificationCount} new updates are waiting in your inbox.`,
            tone: 'info'
          }));
        }

        previousUnreadCountRef.current = nextUnreadCount;
        if (notificationsOpen) {
          dispatch(fetchNotifications());
        }
      } catch (_error) {
        // Ignore intermittent refresh issues and keep the current notification state.
      }
    };

    void syncNotifications();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void syncNotifications({ allowToast: true });
      }
    }, notificationsOpen ? 15000 : 30000);

    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        void syncNotifications({ allowToast: true });
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [dispatch, notificationsOpen, user]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    const handleOnline = () => {
      dispatch(showToast({
        message: 'Back online. PulseRoom is syncing fresh updates.',
        tone: 'success'
      }));
    };

    const handleOffline = () => {
      dispatch(showToast({
        message: 'You are offline. Cached screens and tickets stay available.',
        tone: 'warning',
        duration: 5000
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [dispatch]);

  const navLinkClass = ({ isActive }) =>
    `rounded-full px-4 py-2 text-sm font-medium transition ${isActive ? 'bg-ink text-sand' : 'text-ink/70 hover:bg-white/60'}`;

  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-hero-radial">
      <a href="#main-content" className="skip-nav">Skip to content</a>
      <header className="sticky top-0 z-30 border-b border-ink/8 bg-sand/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <Link to="/" className="flex items-center gap-3">
            <img src="/pulseroom-mark.svg" alt="PulseRoom" className="h-11 w-11 rounded-2xl" />
            <div className="hidden sm:block">
              <p className="font-display text-xl text-ink">PulseRoom</p>
              <p className="text-xs uppercase tracking-[0.25em] text-ink/50">Event operations in motion</p>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-2 md:flex">
            <NavLink to="/" end className={navLinkClass}>Browse</NavLink>
            {user && (user.role === 'organizer' || user.role === 'admin') && (
              <NavLink to="/dashboard" className={navLinkClass}>Organizer</NavLink>
            )}
            {user && user.role === 'admin' && (
              <NavLink to="/admin" className={navLinkClass}>Admin</NavLink>
            )}
            {user && <NavLink to="/speaker" className={navLinkClass}>Workspace</NavLink>}
            {user && <NavLink to="/my-bookings" className={navLinkClass}>My Tickets</NavLink>}
          </nav>

          {/* Theme toggle */}
          <button
            type="button"
            onClick={() => dispatch(toggleTheme())}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="rounded-full border border-ink/10 bg-white/80 p-2 text-ink hover:bg-white/60"
          >
            {theme === 'light' ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </button>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => dispatch(toggleNotifications())}
                  className="relative rounded-full border border-ink/10 bg-white/80 px-4 py-2 text-sm font-medium text-ink"
                >
                  Updates
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 rounded-full bg-ember px-2 py-0.5 text-[10px] font-bold text-white">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* User dropdown button */}
                <div className="relative hidden md:block">
                  <button
                    type="button"
                    onClick={() => setMobileOpen((prev) => !prev)}
                    className="flex items-center gap-2 rounded-full border border-ink/10 bg-white/80 px-4 py-2 text-sm font-medium text-ink"
                  >
                    <span className="max-w-[120px] truncate">{user.email.split('@')[0]}</span>
                    <svg className="h-4 w-4 text-ink/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {mobileOpen && (
                    <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-ink/10 bg-white shadow-bloom">
                      <Link
                        to="/profile"
                        onClick={() => setMobileOpen(false)}
                        className="block px-4 py-3 text-sm text-ink hover:bg-sand/60 rounded-t-2xl"
                      >My Profile</Link>
                      <Link
                        to="/my-bookings"
                        onClick={() => setMobileOpen(false)}
                        className="block px-4 py-3 text-sm text-ink hover:bg-sand/60"
                      >My Tickets</Link>
                      <Link
                        to="/speaker"
                        onClick={() => setMobileOpen(false)}
                        className="block px-4 py-3 text-sm text-ink hover:bg-sand/60"
                      >Workspace</Link>
                      <Link
                        to="/messages"
                        onClick={() => setMobileOpen(false)}
                        className="block px-4 py-3 text-sm text-ink hover:bg-sand/60"
                      >Messages</Link>
                      <hr className="border-ink/8" />
                      <button
                        type="button"
                        onClick={() => { setMobileOpen(false); handleLogout(); }}
                        className="w-full px-4 py-3 text-left text-sm text-ember hover:bg-sand/60 rounded-b-2xl"
                      >Sign out</button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-sand md:hidden"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/auth" className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-sand">
                Sign in
              </Link>
            )}
          </div>
        </div>

        {/* Mobile nav strip */}
        {user && (
          <div className="flex gap-2 overflow-x-auto border-t border-ink/8 px-4 py-2 md:hidden">
            <NavLink to="/" end className={navLinkClass}>Browse</NavLink>
            {(user.role === 'organizer' || user.role === 'admin') && (
              <NavLink to="/dashboard" className={navLinkClass}>Organizer</NavLink>
            )}
            {user.role === 'admin' && (
              <NavLink to="/admin" className={navLinkClass}>Admin</NavLink>
            )}
            <NavLink to="/speaker" className={navLinkClass}>Workspace</NavLink>
            <NavLink to="/my-bookings" className={navLinkClass}>My Tickets</NavLink>
            <NavLink to="/profile" className={navLinkClass}>Profile</NavLink>
            <NavLink to="/messages" className={navLinkClass}>Messages</NavLink>
          </div>
        )}
      </header>

      <NotificationPanel />
      <PwaInstallPrompt />
      <ToastContainer />

      <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12">
        <Outlet />
      </main>
    </div>
  );
};

export default AppShell;
