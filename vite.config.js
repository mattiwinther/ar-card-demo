import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  base: './',
  plugins: [wasm()],
  server: {
    host: true,
  },
  optimizeDeps: {
    exclude: ['@ar-js-org/aruco-rs'],
  },
});
