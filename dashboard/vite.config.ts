import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const target =
  process.env.VITE_PROXY_TARGET ||
  'https://ai-voice-agent-production-69b2.up.railway.app';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target,
        changeOrigin: true,
        secure: false,
        headers: {
          host: 'ai-voice-agent-production-69b2.up.railway.app',
        },
      },
      '/dashboard': {
        target,
        changeOrigin: true,
        secure: false,
        headers: {
          host: 'ai-voice-agent-production-69b2.up.railway.app',
        },
      },
    },
  },
});
