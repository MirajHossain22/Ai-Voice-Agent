import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const target = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target,
        changeOrigin: true,
      },
      '/dashboard': {
        target,
        changeOrigin: true,
      },
    },
  },
});
