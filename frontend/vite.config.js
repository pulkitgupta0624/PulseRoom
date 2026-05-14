const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

const resolveManualChunk = (id) => {
  if (!id.includes('node_modules')) {
    return null;
  }

  if (
    id.includes('@stripe/react-stripe-js') ||
    id.includes('@stripe/stripe-js')
  ) {
    return 'stripe';
  }

  if (id.includes('html5-qrcode') || id.includes('qrcode')) {
    return 'scanner';
  }

  if (id.includes('simple-peer') || id.includes('socket.io-client')) {
    return 'realtime';
  }

  if (id.includes('framer-motion') || id.includes('gsap')) {
    return 'motion';
  }

  return undefined;
};

module.exports = defineConfig({
  envDir: '..',
  plugins: [react()],
  server: {
    port: 5173
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: resolveManualChunk
      }
    }
  }
});
