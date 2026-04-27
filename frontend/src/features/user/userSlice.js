import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api } from '../../lib/api';

// ── Thunks ────────────────────────────────────────────────────────────────────

export const fetchProfile = createAsyncThunk('user/fetchProfile', async (_, thunkApi) => {
  try {
    const response = await api.get('/api/users/me');
    return response.data.data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Unable to load profile');
  }
});

export const updateProfile = createAsyncThunk('user/updateProfile', async (payload, thunkApi) => {
  try {
    const response = await api.patch('/api/users/me', payload);
    return response.data.data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Unable to update profile');
  }
});

export const searchUsers = createAsyncThunk('user/search', async (query, thunkApi) => {
  try {
    const response = await api.get('/api/users/search', { params: { q: query } });
    return response.data.data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Search failed');
  }
});

/**
 * Fetch the list of organizer profiles the current user is following.
 * Backed by GET /api/users/me/following (new endpoint added to user-service).
 */
export const fetchFollowing = createAsyncThunk('user/fetchFollowing', async (_, thunkApi) => {
  try {
    const response = await api.get('/api/users/me/following');
    return response.data.data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Unable to load following list');
  }
});

/**
 * Optimistically update the following list after a follow/unfollow action.
 * Call this after the API responds so Redux state stays in sync without
 * requiring a full re-fetch.
 */
export const syncFollowState = createAsyncThunk(
  'user/syncFollowState',
  async ({ organizerId, isFollowing, organizerProfile }, thunkApi) => {
    return { organizerId, isFollowing, organizerProfile };
  }
);

// ── Slice ─────────────────────────────────────────────────────────────────────

const userSlice = createSlice({
  name: 'user',
  initialState: {
    profile: null,
    searchResults: [],
    following: [],           // array of organizer UserProfile objects
    followingLoaded: false,  // whether we've fetched at least once
    loading: false,
    saving: false,
    followingLoading: false,
    error: null,
    saved: false
  },
  reducers: {
    clearSaved(state) {
      state.saved = false;
    },
    clearSearch(state) {
      state.searchResults = [];
    }
  },
  extraReducers: (builder) => {
    builder
      // ── fetchProfile ────────────────────────────────────────────────────────
      .addCase(fetchProfile.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProfile.fulfilled, (state, action) => {
        state.loading = false;
        state.profile = action.payload;
      })
      .addCase(fetchProfile.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // ── updateProfile ───────────────────────────────────────────────────────
      .addCase(updateProfile.pending, (state) => {
        state.saving = true;
        state.error = null;
        state.saved = false;
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.saving = false;
        state.profile = action.payload;
        state.saved = true;
      })
      .addCase(updateProfile.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload;
      })

      // ── searchUsers ─────────────────────────────────────────────────────────
      .addCase(searchUsers.fulfilled, (state, action) => {
        state.searchResults = action.payload;
      })

      // ── fetchFollowing ──────────────────────────────────────────────────────
      .addCase(fetchFollowing.pending, (state) => {
        state.followingLoading = true;
      })
      .addCase(fetchFollowing.fulfilled, (state, action) => {
        state.followingLoading = false;
        state.following = action.payload;
        state.followingLoaded = true;
      })
      .addCase(fetchFollowing.rejected, (state) => {
        state.followingLoading = false;
        state.followingLoaded = true; // avoid infinite retry
      })

      // ── syncFollowState ─────────────────────────────────────────────────────
      .addCase(syncFollowState.fulfilled, (state, action) => {
        const { organizerId, isFollowing, organizerProfile } = action.payload;
        if (isFollowing) {
          // Add to following list if not already present
          const exists = state.following.some((o) => o.userId === organizerId);
          if (!exists && organizerProfile) {
            state.following = [
              { ...organizerProfile, isFollowingOrganizer: true, canFollowOrganizer: true },
              ...state.following
            ];
          }
        } else {
          // Remove from following list
          state.following = state.following.filter((o) => o.userId !== organizerId);
        }
      });
  }
});

export const { clearSaved, clearSearch } = userSlice.actions;
export default userSlice.reducer;