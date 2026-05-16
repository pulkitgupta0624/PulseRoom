import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, syncAccessTokenHeader } from '../../lib/api';

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
  syncAccessTokenHeader(payload.accessToken);
};

const clearSession = () => {
  localStorage.removeItem('pulseroom.accessToken');
  localStorage.removeItem('pulseroom.user');
  syncAccessTokenHeader('');
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
    const user = localStorage.getItem('pulseroom.user');
    if (!token && !user) {
      return null;
    }

    if (!token) {
      const refreshResponse = await api.post('/api/auth/refresh');
      const data = refreshResponse.data.data;
      if (data.accessToken) {
        persistSession(data);
      }
      return data;
    }

    const response = await api.get('/api/auth/me');
    const hydratedUser = {
      id: response.data.data.id,
      email: response.data.data.email,
      role: response.data.data.role,
      permissions: response.data.data.permissions,
      twoFactorEnabled: Boolean(response.data.data.twoFactor?.enabled)
    };
    const activeToken = localStorage.getItem('pulseroom.accessToken') || token;
    const nextSession = {
      accessToken: activeToken,
      user: hydratedUser
    };
    persistSession(nextSession);
    return nextSession;
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
    clearSession();
    return thunkApi.rejectWithValue(error.response?.data?.message || 'Logout failed');
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: initialUser,
    accessToken: localStorage.getItem('pulseroom.accessToken'),
    twoFactorChallenge: null,
    sessionChecked: !(initialUser || localStorage.getItem('pulseroom.accessToken')),
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
        state.sessionChecked = true;
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
          state.sessionChecked = true;
          return;
        }

        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
        state.twoFactorChallenge = null;
        state.sessionChecked = true;
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
        state.sessionChecked = true;
      })
      .addCase(verifyTwoFactorLogin.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(bootstrapSession.fulfilled, (state, action) => {
        state.user = action.payload?.user || null;
        state.accessToken = action.payload?.accessToken || null;
        state.twoFactorChallenge = null;
        state.sessionChecked = true;
      })
      .addCase(bootstrapSession.rejected, (state) => {
        state.user = null;
        state.accessToken = null;
        state.twoFactorChallenge = null;
        state.sessionChecked = true;
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        state.twoFactorChallenge = null;
        state.sessionChecked = true;
      })
      .addCase(logout.rejected, (state) => {
        state.user = null;
        state.accessToken = null;
        state.twoFactorChallenge = null;
        state.sessionChecked = true;
      });
  }
});

export const { clearTwoFactorChallenge } = authSlice.actions;
export default authSlice.reducer;
