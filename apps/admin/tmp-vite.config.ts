import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
const api = { target: 'http://127.0.0.1:3100', changeOrigin: false };
export default defineConfig({ base: '/admin/', plugins: [react()], server: { port: 5176, strictPort: true, proxy: { '/api': api, '/media': api } } });
