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

const getInitialTheme = () => {
  if (typeof window !== 'undefined') {
    const storedPrefs = localStorage.getItem('theme');
    if (storedPrefs) return storedPrefs;
    const userMedia = window.matchMedia('(prefers-color-scheme: dark)');
    if (userMedia.matches) return 'dark';
  }
  return 'light';
};

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    toasts: [],  // [{ id, message, tone, duration }]
    theme: getInitialTheme()  // 'light' | 'dark'
  },
  reducers: {
    toggleTheme: (state) => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', state.theme);
    },
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

export const { showToast, dismissToast, clearToasts, toggleTheme } = uiSlice.actions;
export default uiSlice.reducer;