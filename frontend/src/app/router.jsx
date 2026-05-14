import { Suspense, lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import AppShell from './AppShell';
import ProtectedRoute from '../components/ProtectedRoute';
import HomePage from '../pages/HomePage';
import AuthPage from '../pages/AuthPage';
import NotFoundPage from '../pages/NotFoundPage';

const EventDetailPage = lazy(() => import('../pages/EventDetailPage'));
const SeriesDetailPage = lazy(() => import('../pages/SeriesDetailPage'));
const SponsorApplicationPage = lazy(() => import('../pages/SponsorApplicationPage'));
const SponsorBoothPage = lazy(() => import('../pages/SponsorBoothPage'));
const SponsorPortalPage = lazy(() => import('../pages/SponsorPortalPage'));
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const LiveEventPage = lazy(() => import('../pages/LiveEventPage'));
const AdminPage = lazy(() => import('../pages/AdminPage'));
const ProfilePage = lazy(() => import('../pages/ProfilePage'));
const SpeakerPortalPage = lazy(() => import('../pages/SpeakerPortalPage'));
const BookingsPage = lazy(() => import('../pages/BookingsPage'));
const MessagesPage = lazy(() => import('../pages/MessagesPage'));
const CheckInPage = lazy(() => import('../pages/CheckInPage'));
const OrganizerProfilePage = lazy(() => import('../pages/OrganizerProfilePage'));

const RouteLoader = () => (
  <div className="flex min-h-[40vh] items-center justify-center px-6 py-16">
    <div className="space-y-3 text-center">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-reef border-t-transparent" />
      <p className="text-sm text-ink/55">Loading the next PulseRoom view...</p>
    </div>
  </div>
);

const withRouteLoader = (Component) => (
  <Suspense fallback={<RouteLoader />}>
    <Component />
  </Suspense>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'auth', element: <AuthPage /> },
      { path: 'events/:eventId', element: withRouteLoader(EventDetailPage) },
      { path: 'series/:seriesId', element: withRouteLoader(SeriesDetailPage) },
      { path: 'events/:eventId/sponsor', element: withRouteLoader(SponsorApplicationPage) },
      { path: 'events/:eventId/sponsors/:sponsorId', element: withRouteLoader(SponsorBoothPage) },
      { path: 'events/:eventId/sponsors/:sponsorId/portal', element: withRouteLoader(SponsorPortalPage) },
      {
        path: 'events/:eventId/live',
        element: <ProtectedRoute>{withRouteLoader(LiveEventPage)}</ProtectedRoute>
      },
      {
        path: 'events/:eventId/check-in',
        element: <ProtectedRoute>{withRouteLoader(CheckInPage)}</ProtectedRoute>
      },
      {
        path: 'dashboard',
        element: <ProtectedRoute roles={['organizer', 'admin']}>{withRouteLoader(DashboardPage)}</ProtectedRoute>
      },
      {
        path: 'admin',
        element: <ProtectedRoute roles={['admin']}>{withRouteLoader(AdminPage)}</ProtectedRoute>
      },
      {
        path: 'profile',
        element: <ProtectedRoute>{withRouteLoader(ProfilePage)}</ProtectedRoute>
      },
      {
        path: 'speaker',
        element: <ProtectedRoute>{withRouteLoader(SpeakerPortalPage)}</ProtectedRoute>
      },
      {
        path: 'my-bookings',
        element: <ProtectedRoute>{withRouteLoader(BookingsPage)}</ProtectedRoute>
      },
      {
        path: 'messages',
        element: <ProtectedRoute>{withRouteLoader(MessagesPage)}</ProtectedRoute>
      },
      {
        path: 'messages/:userId',
        element: <ProtectedRoute>{withRouteLoader(MessagesPage)}</ProtectedRoute>
      },
      { path: 'studio/:publicHandle', element: withRouteLoader(OrganizerProfilePage) },
      { path: 'organizers/:organizerId', element: withRouteLoader(OrganizerProfilePage) },
      { path: '*', element: <NotFoundPage /> }
    ]
  }
]);
