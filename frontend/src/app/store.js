import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import eventsReducer from '../features/events/eventsSlice';
import notificationsReducer from '../features/notifications/notificationsSlice';
import bookingsReducer from '../features/bookings/bookingsSlice';
import userReducer from '../features/user/userSlice';
import uiReducer from '../features/ui/uiSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    events: eventsReducer,
    notifications: notificationsReducer,
    bookings: bookingsReducer,
    user: userReducer,
    ui: uiReducer
  }
});