import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The API checks that a changing request comes from its own host (Origin against Host, PLAN 15),
 * so the proxy must keep the browser's Host. Vite's short form would replace it with the target's.
 */
const api = { target: 'http://127.0.0.1:3000', changeOrigin: false };

// The panel lives at PUBLIC_URL/admin/ next to the Mini App, on the same origin as the API, so the
// session cookie needs no CORS. In development /api goes to the server (npm run dev:api).
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { '/api': api, '/media': api },
  },
});
