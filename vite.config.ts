import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        menu: resolve(import.meta.dirname, 'web/index.html'),
        admin: resolve(import.meta.dirname, 'web/admin/index.html'),
      },
    },
  },
});
