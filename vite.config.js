import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Forward /api/mvsep/* to the local Express proxy in dev.
      // In production (Cloudflare Pages) this same path is handled
      // by functions/api/mvsep/[[path]].js — no changes needed.
      '/api/mvsep': {
        target: 'http://localhost:8787',
        changeOrigin: false,
      },
    },
  },
});
