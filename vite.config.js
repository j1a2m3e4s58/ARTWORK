import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.WEB_PORT || 43127),
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${process.env.API_PORT || 43130}`,
      '/uploads': `http://127.0.0.1:${process.env.API_PORT || 43130}`,
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
