import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PUERTO_API = Number(process.env.PUERTO ?? 3001);

export default defineConfig({
  plugins: [react()],
  root: 'src/client',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api/': `http://127.0.0.1:${PUERTO_API}`,
    },
  },
});
