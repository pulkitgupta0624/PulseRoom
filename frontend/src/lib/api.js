import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080',
  withCredentials: true
});

const AUTH_REFRESH_BYPASS_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout'
];

const syncAccessTokenHeader = (token = '') => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    return;
  }

  delete api.defaults.headers.common.Authorization;
};

const shouldBypassAuthRefresh = (requestUrl = '') =>
  AUTH_REFRESH_BYPASS_PATHS.some((path) => String(requestUrl || '').includes(path));

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pulseroom.accessToken');
  config.headers = config.headers || {};

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    syncAccessTokenHeader(token);
  } else {
    delete config.headers.Authorization;
    syncAccessTokenHeader('');
  }

  return config;
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (shouldBypassAuthRefresh(originalRequest.url)) {
        localStorage.removeItem('pulseroom.accessToken');
        localStorage.removeItem('pulseroom.user');
        syncAccessTokenHeader('');
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/api/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const { accessToken, user } = response.data.data;
        localStorage.setItem('pulseroom.accessToken', accessToken);
        localStorage.setItem('pulseroom.user', JSON.stringify(user));

        syncAccessTokenHeader(accessToken);
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;

        processQueue(null, accessToken);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('pulseroom.accessToken');
        localStorage.removeItem('pulseroom.user');
        syncAccessTokenHeader('');
        window.location.href = '/auth';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export { api, syncAccessTokenHeader };
