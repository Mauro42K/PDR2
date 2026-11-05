import { defineConfig } from 'vitest/config';

// Pruebas de proceso: lanzan los runners y comprueban qué ocurre antes de conectar o migrar.
// No entran en test:unit y no necesitan jsdom.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/probes/**/*.probe.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 30_000
  }
});
