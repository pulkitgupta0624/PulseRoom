import { createBrowserRouter } from 'react-router-dom';
import AppShell from './AppShell';
import ProtectedRoute from '../components/ProtectedRoute';
import HomePage from '../pages/HomePage';
import AuthPage from '../pages/AuthPage';
import EventDetailPage from '../pages/EventDetailPage';
import SponsorApplicationPage from '../pages/SponsorApplicationPage';
import DashboardPage from '../pages/DashboardPage';
import LiveEventPage from '../pages/LiveEventPage';
import AdminPage from '../pages/AdminPage';
import ProfilePage from '../pages/ProfilePage.jsx';
import BookingsPage from '../pages/BookingsPage';
import MessagesPage from '../pages/MessagesPage';
import CheckInPage from '../pages/CheckInPage';
import NotFoundPage from '../pages/NotFoundPage';
import OrganizerProfilePage from '../pages/OrganizerProfilePage'; 

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'auth', element: <AuthPage /> },
      { path: 'events/:eventId', element: <EventDetailPage /> },
      { path: 'events/:eventId/sponsor', element: <SponsorApplicationPage /> },
      {
        path: 'events/:eventId/live',
        element: <ProtectedRoute><LiveEventPage /></ProtectedRoute>
      },
      {
        path: 'events/:eventId/check-in',
        element: <ProtectedRoute roles={['organizer', 'admin']}><CheckInPage /></ProtectedRoute>
      },
      {
        path: 'dashboard',
        element: <ProtectedRoute roles={['organizer', 'admin']}><DashboardPage /></ProtectedRoute>
      },
      {
        path: 'admin',
        element: <ProtectedRoute roles={['admin']}><AdminPage /></ProtectedRoute>
      },
      {
        path: 'profile',
        element: <ProtectedRoute><ProfilePage /></ProtectedRoute>
      },
      {
        path: 'my-bookings',
        element: <ProtectedRoute><BookingsPage /></ProtectedRoute>
      },
      {
        path: 'messages',
        element: <ProtectedRoute><MessagesPage /></ProtectedRoute>
      },
      {
        path: 'messages/:userId',
        element: <ProtectedRoute><MessagesPage /></ProtectedRoute>
      },
      { path: 'organizers/:organizerId', element: <OrganizerProfilePage /> },
      { path: '*', element: <NotFoundPage /> }
    ]
  }
]);
