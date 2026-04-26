import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api } from '../../lib/api';

export const fetchNotifications = createAsyncThunk('notifications/fetchAll', async (_, thunkApi) => {
  try {
    const response = await api.get('/api/notifications/me');
    return response.data.data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Unable to load notifications');
  }
});

export const fetchUnreadCount = createAsyncThunk('notifications/fetchUnreadCount', async (_, thunkApi) => {
  try {
    const response = await api.get('/api/notifications/me/unread-count');
    return response.data.data.unreadCount;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Unable to load unread count');
  }
});

export const markNotificationRead = createAsyncThunk('notifications/markRead', async (notificationId, thunkApi) => {
  try {
    const response = await api.patch(`/api/notifications/${notificationId}/read`);
    return response.data.data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Unable to update notification');
  }
});

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState: {
    list: [],
    unreadCount: 0,
    isOpen: false
  },
  reducers: {
    toggleNotifications(state) {
      state.isOpen = !state.isOpen;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.list = action.payload;
      })
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        state.unreadCount = action.payload;
      })
      .addCase(markNotificationRead.fulfilled, (state, action) => {
        state.list = state.list.map((item) => (item._id === action.payload._id ? action.payload : item));
        state.unreadCount = state.list.filter((item) => !item.readAt).length;
      });
  }
});

export const { toggleNotifications } = notificationsSlice.actions;
export default notificationsSlice.reducer;

