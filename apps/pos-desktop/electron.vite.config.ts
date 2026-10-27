import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// @crumble/shared is TypeScript source, so it must be bundled, not left as a runtime require.
const externalizeDeps = { exclude: ['@crumble/shared'] };

export default defineConfig({
  main: {
    build: {
      externalizeDeps,
      rollupOptions: { input: { index: resolve(__dirname, 'electron/main.ts') } },
    },
  },
  preload: {
    build: {
      externalizeDeps,
      rollupOptions: { input: { index: resolve(__dirname, 'electron/preload.ts') } },
    },
  },
  renderer: {
    root: '.',
    plugins: [react()],
    build: {
      rollupOptions: { input: resolve(__dirname, 'index.html') },
    },
  },
});
