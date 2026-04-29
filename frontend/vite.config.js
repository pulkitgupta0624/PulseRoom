const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

module.exports = defineConfig({
  envDir: '..',
  plugins: [react()],
  server: {
    port: 5173
  }
});
