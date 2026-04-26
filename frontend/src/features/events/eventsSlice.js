import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api } from '../../lib/api';

export const fetchEvents = createAsyncThunk('events/fetchAll', async (params = {}, thunkApi) => {
  try {
    const response = await api.get('/api/events', { params });
    return response.data.data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Unable to load events');
  }
});

export const fetchRecommendations = createAsyncThunk('events/fetchRecommendations', async (_, thunkApi) => {
  try {
    const response = await api.get('/api/events/recommendations/me');
    return response.data.data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Unable to load recommendations');
  }
});

export const fetchEventById = createAsyncThunk('events/fetchById', async (eventId, thunkApi) => {
  try {
    const response = await api.get(`/api/events/${eventId}`);
    return response.data.data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Unable to load event');
  }
});

export const fetchOrganizerDashboard = createAsyncThunk('events/fetchDashboard', async (_, thunkApi) => {
  try {
    const response = await api.get('/api/events/organizer/dashboard');
    return response.data.data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Unable to load dashboard');
  }
});

export const createEvent = createAsyncThunk('events/create', async (payload, thunkApi) => {
  try {
    const response = await api.post('/api/events', payload);
    return response.data.data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Unable to create event');
  }
});

// NEW: Update an existing event
export const updateEvent = createAsyncThunk('events/update', async ({ eventId, payload }, thunkApi) => {
  try {
    const response = await api.patch(`/api/events/${eventId}`, payload);
    return response.data.data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Unable to update event');
  }
});

// NEW: Delete an event
export const deleteEvent = createAsyncThunk('events/delete', async (eventId, thunkApi) => {
  try {
    await api.delete(`/api/events/${eventId}`);
    return eventId;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Unable to delete event');
  }
});

export const publishEvent = createAsyncThunk('events/publish', async (eventId, thunkApi) => {
  try {
    const response = await api.post(`/api/events/${eventId}/publish`);
    return response.data.data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Unable to publish event');
  }
});

const eventsSlice = createSlice({
  name: 'events',
  initialState: {
    list: [],
    recommendations: [],
    currentEvent: null,
    dashboard: null,
    searchFacets: {},
    searchMeta: null,
    loading: false,
    saving: false,
    error: null
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchEvents.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchEvents.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload.items || action.payload;
        state.searchFacets = action.payload.facets || {};
        state.searchMeta = action.payload.meta || {
          found: Array.isArray(action.payload) ? action.payload.length : 0
        };
      })
      .addCase(fetchEvents.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchRecommendations.fulfilled, (state, action) => {
        state.recommendations = action.payload;
      })
      .addCase(fetchEventById.fulfilled, (state, action) => {
        state.currentEvent = action.payload;
      })
      .addCase(fetchOrganizerDashboard.fulfilled, (state, action) => {
        state.dashboard = action.payload;
      })
      .addCase(createEvent.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(createEvent.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(createEvent.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload;
      })
      .addCase(updateEvent.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(updateEvent.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(updateEvent.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload;
      })
      .addCase(deleteEvent.fulfilled, (state) => {
        state.loading = false;
      });
  }
});

export default eventsSlice.reducer;
