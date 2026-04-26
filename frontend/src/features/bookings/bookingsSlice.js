import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api } from '../../lib/api';

export const fetchMyBookings = createAsyncThunk('bookings/fetchMine', async (_, thunkApi) => {
  try {
    const response = await api.get('/api/bookings/me');
    return response.data.data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Unable to load bookings');
  }
});

export const requestRefund = createAsyncThunk('bookings/refund', async (bookingId, thunkApi) => {
  try {
    const response = await api.post(`/api/bookings/${bookingId}/refund`);
    return response.data.data.booking;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Unable to process refund');
  }
});

const bookingsSlice = createSlice({
  name: 'bookings',
  initialState: { list: [], loading: false, error: null, refundingId: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyBookings.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchMyBookings.fulfilled, (state, action) => { state.loading = false; state.list = action.payload; })
      .addCase(fetchMyBookings.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(requestRefund.pending, (state, action) => { state.refundingId = action.meta.arg; })
      .addCase(requestRefund.fulfilled, (state, action) => {
        state.refundingId = null;
        state.list = state.list.map((item) => item._id === action.payload._id ? action.payload : item);
      })
      .addCase(requestRefund.rejected, (state) => { state.refundingId = null; });
  }
});

export default bookingsSlice.reducer;