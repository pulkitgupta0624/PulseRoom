import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api } from '../../lib/api';

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

const userSlice = createSlice({
  name: 'user',
  initialState: { profile: null, searchResults: [], loading: false, saving: false, error: null, saved: false },
  reducers: {
    clearSaved(state) { state.saved = false; },
    clearSearch(state) { state.searchResults = []; }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProfile.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchProfile.fulfilled, (state, action) => { state.loading = false; state.profile = action.payload; })
      .addCase(fetchProfile.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(updateProfile.pending, (state) => { state.saving = true; state.error = null; state.saved = false; })
      .addCase(updateProfile.fulfilled, (state, action) => { state.saving = false; state.profile = action.payload; state.saved = true; })
      .addCase(updateProfile.rejected, (state, action) => { state.saving = false; state.error = action.payload; })
      .addCase(searchUsers.fulfilled, (state, action) => { state.searchResults = action.payload; });
  }
});

export const { clearSaved, clearSearch } = userSlice.actions;
export default userSlice.reducer;