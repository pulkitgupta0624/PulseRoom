import { io } from 'socket.io-client';

const baseUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:8080';

const createSocket = (path) => {
  const token = localStorage.getItem('pulseroom.accessToken');

  return io(baseUrl, {
    path,
    auth: {
      token
    },
    transports: ['websocket', 'polling']
  });
};

export { createSocket };

