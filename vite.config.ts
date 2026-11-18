import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    // Engine tests generate and solve many puzzles; under a parallel full run
    // they can exceed Vitest's 5 s default, so allow more headroom.
    testTimeout: 30000,
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    coverage: { provider: 'v8', include: ['src/**'] },
  },
});
