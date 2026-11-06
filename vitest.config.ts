import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/client/test-setup.ts'],
    css: true,
    exclude: [
      'e2e/**',
      'node_modules/**',
      'dist/**',
      'dist-server/**',
      'scripts/probes/**',
      '.worktrees/**',
      '.rsc/**',
      '.claude/**',
      '02-DOCS/**',
    ],
  },
});
