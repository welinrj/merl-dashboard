import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path, // keep /api prefix — backend expects it
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Code-split large vendor libraries for better caching
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'chart-vendor': ['recharts'],
          'query-vendor': ['@tanstack/react-query'],
          'i18n-vendor': ['i18next', 'react-i18next'],
          // Each Iconsax icon module carries all six style variants (Linear,
          // Outline, Bold, Bulk, Broken, TwoTone) even though the portal only
          // ever renders Linear, so the icon set is heavier than the glyph
          // count suggests. Splitting it out keeps that weight in a chunk the
          // browser caches once, instead of re-downloading it with the app
          // bundle on every deploy — this portal is used on field phones.
          'icon-vendor': ['iconsax-reactjs'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },

  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'axios',
      'recharts',
      '@tanstack/react-query',
      'i18next',
      'react-i18next',
    ],
  },
});
