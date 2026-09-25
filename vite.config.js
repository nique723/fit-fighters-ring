import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  server: {
    port: 5173,
    host: true
  },
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision']
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});
