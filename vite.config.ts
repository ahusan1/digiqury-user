import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      build: {
        // Optimize bundle size
        minify: 'terser',
        terserOptions: {
          compress: {
            drop_console: true,
            drop_debugger: true,
          },
          output: {
            comments: false,
          },
        },
        reportCompressedSize: true,
        chunkSizeWarningLimit: 10000,
        rollupOptions: {
          output: {
            manualChunks(id) {
              const normalizedId = id.replace(/\\/g, '/');

              if (!normalizedId.includes('node_modules')) return;

              // Separate Three.js completely to lazy load if needed
              if (normalizedId.includes('three')) {
                return 'vendor-three';
              }

              // Supabase is large, keep separate
              if (normalizedId.includes('@supabase')) {
                return 'vendor-supabase';
              }

              // React core
              if (normalizedId.includes('react-dom') || normalizedId.includes('react/jsx')) {
                return 'vendor-react-dom';
              }

              if (normalizedId.includes('react') || normalizedId.includes('scheduler')) {
                return 'vendor-react';
              }

              // Other vendors
              if (normalizedId.includes('react-router')) {
                return 'vendor-router';
              }

              if (normalizedId.includes('react-hot-toast')) {
                return 'vendor-toast';
              }

              return 'vendor-misc';
            },
          },
        },
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
