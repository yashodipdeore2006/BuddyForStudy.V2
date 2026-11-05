import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const configuredApiUrl = (env.VITE_API_URL || '').trim();
  let apiTarget = configuredApiUrl || 'http://127.0.0.1:5000';

  // Windows may resolve localhost to IPv6 while the local API binds to IPv4.
  // Normalize only this loopback alias; preserve configured remote API hosts.
  try {
    const targetUrl = new URL(apiTarget);
    if (targetUrl.hostname === 'localhost') targetUrl.hostname = '127.0.0.1';
    apiTarget = targetUrl.origin;
  } catch {
    throw new Error('VITE_API_URL must be a valid absolute API origin, such as http://127.0.0.1:5000.');
  }

  return {
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
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/health': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
      headers: {
        // Google Identity Services may open a cross-origin popup and use postMessage.
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
    preview: {
      headers: {
        // Keep preview builds compatible with Google Identity Services popups.
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
  };
});
