import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  base: './',
  plugins: [wasm(), topLevelAwait()],
  server: {
    host: true,
  },
  optimizeDeps: {
    exclude: ['@ar-js-org/aruco-rs'],
  },
});
