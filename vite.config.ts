import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = 'http://127.0.0.1:3001';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/socket.io': { target: backend, ws: true, changeOrigin: false },
      '/api': { target: backend, changeOrigin: false },
      '/auth': { target: backend, changeOrigin: false },
    },
  },
});
