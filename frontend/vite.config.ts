import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const root = path.resolve(import.meta.dirname);

export default defineConfig({
  base: '/assets/ths_pos/pos/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      '@assets': path.resolve(root, 'attached_assets'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root,
  build: {
    outDir: path.resolve(root, '../ths_pos/public/pos'),
    emptyOutDir: true,
  },
});
