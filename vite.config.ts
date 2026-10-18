import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5274,
    strictPort: true,
    watch: {
      ignored: ['**/build/**', '**/.mygo/**', '**/dist/**'],
      followSymlinks: false,
    },
  },
  clearScreen: false,
});
