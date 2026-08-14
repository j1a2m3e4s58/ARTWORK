import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  build: {
    // heic2any is intentionally loaded only when someone selects an iPhone
    // HEIC photo. Its upstream single-file bundle is large but never blocks
    // the initial application or Messages download.
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('framer-motion')) return 'motion-vendor';
          if (id.includes('recharts') || id.includes('d3-')) return 'charts-vendor';
          if (id.includes('lucide-react') || id.includes('react-icons')) return 'icons-vendor';
          if (/node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'react-vendor';
          return undefined;
        },
      },
    },
  },
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
