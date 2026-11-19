import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * The API checks that a changing request comes from its own host (Origin against Host, PLAN 15),
 * so the proxy must keep the browser's Host. Vite's short form would replace it with the target's.
 */
const api = { target: 'http://127.0.0.1:3000', changeOrigin: false };

/**
 * `/admin` without the slash is the panel too: the menu's "Bugun" links there (React Router's
 * basename), and Vite would otherwise answer it with "did you mean /admin/?". nginx does the same
 * in production (deploy/nginx.example.conf).
 */
const adminWithoutSlash = (): Plugin => ({
  name: 'admin-without-slash',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const url = request.url ?? '';
      if (url === '/admin' || url.startsWith('/admin?')) {
        response.statusCode = 301;
        response.setHeader('Location', `/admin/${url.slice('/admin'.length)}`);
        response.end();
        return;
      }
      next();
    });
  },
});

// The panel lives at PUBLIC_URL/admin/ next to the Mini App, on the same origin as the API, so the
// session cookie needs no CORS. In development /api goes to the server (npm run dev:api).
export default defineConfig({
  base: '/admin/',
  plugins: [react(), adminWithoutSlash()],
  server: {
    port: 5174,
    proxy: { '/api': api, '/media': api },
  },
});
