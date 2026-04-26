import { createSlice } from '@reduxjs/toolkit';

let nextId = 1;

/**
 * uiSlice  — global toast / snackbar system
 *
 * Dispatching helpers:
 *   dispatch(showToast({ message: 'Done!', tone: 'success' }))
 *   dispatch(showToast({ message: 'Oops!', tone: 'error', duration: 6000 }))
 *   dispatch(dismissToast(id))
 *   dispatch(clearToasts())
 *
 * tone: 'success' | 'error' | 'info' | 'warning'
 * duration: milliseconds before auto-dismiss (default 4000)
 */
const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    toasts: []  // [{ id, message, tone, duration }]
  },
  reducers: {
    showToast: (state, action) => {
      const { message, tone = 'info', duration = 4000 } = action.payload;
      state.toasts.push({ id: nextId++, message, tone, duration });
    },
    dismissToast: (state, action) => {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    clearToasts: (state) => {
      state.toasts = [];
    }
  }
});

export const { showToast, dismissToast, clearToasts } = uiSlice.actions;
export default uiSlice.reducer;