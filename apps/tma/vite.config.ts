import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Keeps the browser's Host, as nginx does in production (see apps/admin/vite.config.ts). */
const api = { target: 'http://127.0.0.1:3000', changeOrigin: false };

// In development the API runs on the server (npm run dev or dev:api); in production both are
// served from the same origin, so the client always calls relative /api paths.
export default defineConfig({
  plugins: [react()],
  build: {
    // scripts/check-bundle.mjs reads it to measure what each role actually downloads.
    manifest: true,
  },
  server: {
    port: 5173,
    proxy: { '/api': api, '/media': api },
    // Telegram needs HTTPS: in development the app is reached through a tunnel.
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.trycloudflare.com'],
  },
});
