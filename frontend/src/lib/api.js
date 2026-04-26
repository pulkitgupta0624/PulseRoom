import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080',
  withCredentials: true // sends the httpOnly refresh cookie automatically
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pulseroom.accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Track if a refresh is already in progress to avoid infinite loops
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
    const originalRequest = error.config;

    // Only attempt refresh on 401 and only once per request
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't refresh on auth endpoints themselves (login/register/refresh)
      if (originalRequest.url?.includes('/api/auth/')) {
        localStorage.removeItem('pulseroom.accessToken');
        localStorage.removeItem('pulseroom.user');
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Queue this request until the refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // The refresh cookie is sent automatically via withCredentials
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/api/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const { accessToken, user } = response.data.data;
        localStorage.setItem('pulseroom.accessToken', accessToken);
        localStorage.setItem('pulseroom.user', JSON.stringify(user));

        api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;

        processQueue(null, accessToken);
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh itself failed — session is truly dead
        processQueue(refreshError, null);
        localStorage.removeItem('pulseroom.accessToken');
        localStorage.removeItem('pulseroom.user');
        window.location.href = '/auth'; // redirect to login
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export { api };