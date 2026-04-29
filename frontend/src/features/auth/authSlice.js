import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api } from '../../lib/api';

const storedUser = localStorage.getItem('pulseroom.user');

const parseStoredUser = () => {
  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(storedUser);
  } catch (_error) {
    localStorage.removeItem('pulseroom.user');
    localStorage.removeItem('pulseroom.accessToken');
    return null;
  }
};

const initialUser = parseStoredUser();

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
    const data = response.data.data;
    if (data.accessToken) {
      persistSession(data);
    }
    return data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Registration failed');
  }
});

export const login = createAsyncThunk('auth/login', async (payload, thunkApi) => {
  try {
    const response = await api.post('/api/auth/login', payload);
    const data = response.data.data;
    if (data.accessToken) {
      persistSession(data);
    } else {
      clearSession();
    }
    return data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Login failed');
  }
});

export const verifyTwoFactorLogin = createAsyncThunk('auth/verifyTwoFactorLogin', async (payload, thunkApi) => {
  try {
    const response = await api.post('/api/auth/login/verify-2fa', payload);
    const data = response.data.data;
    if (data.accessToken) {
      persistSession(data);
    }
    return data;
  } catch (error) {
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Two-factor verification failed');
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
      permissions: response.data.data.permissions,
      twoFactorEnabled: Boolean(response.data.data.twoFactor?.enabled)
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
    twoFactorChallenge: null,
    loading: false,
    error: null
  },
  reducers: {
    clearTwoFactorChallenge(state) {
      state.twoFactorChallenge = null;
      state.error = null;
    }
  },
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
        state.twoFactorChallenge = null;
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
        if (action.payload.requiresTwoFactor) {
          state.twoFactorChallenge = {
            token: action.payload.twoFactorToken,
            email: action.payload.user?.email || ''
          };
          state.user = null;
          state.accessToken = null;
          return;
        }

        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
        state.twoFactorChallenge = null;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(verifyTwoFactorLogin.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(verifyTwoFactorLogin.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
        state.twoFactorChallenge = null;
      })
      .addCase(verifyTwoFactorLogin.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(bootstrapSession.fulfilled, (state, action) => {
        state.user = action.payload?.user || null;
        state.accessToken = action.payload?.accessToken || null;
        state.twoFactorChallenge = null;
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        state.twoFactorChallenge = null;
      });
  }
});

export const { clearTwoFactorChallenge } = authSlice.actions;
export default authSlice.reducer;
