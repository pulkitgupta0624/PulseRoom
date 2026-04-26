import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api } from '../../lib/api';

const storedUser = localStorage.getItem('pulseroom.user');
const initialUser = storedUser ? JSON.parse(storedUser) : null;

const persistSession = (payload) => {
  localStorage.setItem('pulseroom.accessToken', payload.accessToken);
  localStorage.setItem('pulseroom.user', JSON.stringify(payload.user));
};

const clearSession = () => {
  localStorage.removeItem('pulseroom.accessToken');
  localStorage.removeItem('pulseroom.user');
};

export const register = createAsyncThunk('auth/register', async (payload, thunkApi) => {
  try {
    const response = await api.post('/api/auth/register', payload);
    persistSession(response.data.data);
    return response.data.data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Registration failed');
  }
});

export const login = createAsyncThunk('auth/login', async (payload, thunkApi) => {
  try {
    const response = await api.post('/api/auth/login', payload);
    persistSession(response.data.data);
    return response.data.data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Login failed');
  }
});

export const bootstrapSession = createAsyncThunk('auth/bootstrap', async (_, thunkApi) => {
  try {
    const token = localStorage.getItem('pulseroom.accessToken');
    if (!token) {
      return null;
    }

    const response = await api.get('/api/auth/me');
    const user = {
      id: response.data.data.id,
      email: response.data.data.email,
      role: response.data.data.role,
      permissions: response.data.data.permissions
    };
    localStorage.setItem('pulseroom.user', JSON.stringify(user));
    return {
      accessToken: token,
      user
    };
  } catch (error) {
    clearSession();
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Session expired');
  }
});

export const logout = createAsyncThunk('auth/logout', async (_, thunkApi) => {
  try {
    await api.post('/api/auth/logout');
    clearSession();
    return true;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Logout failed');
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: initialUser,
    accessToken: localStorage.getItem('pulseroom.accessToken'),
    loading: false,
    error: null
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(register.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(bootstrapSession.fulfilled, (state, action) => {
        state.user = action.payload?.user || null;
        state.accessToken = action.payload?.accessToken || null;
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
      });
  }
});

export default authSlice.reducer;

