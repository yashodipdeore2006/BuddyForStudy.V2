import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    headers: {
      // Google Identity Services may open a cross-origin popup and use postMessage.
      // Allow the popup relationship during local development.
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  preview: {
    headers: {
      // Keep preview builds compatible with Google Identity Services popups.
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
});
