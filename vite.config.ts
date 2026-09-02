import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Core analysis tests run in plain Node with no DOM available — the same
    // constraint the engines live under. UI/adapter tests get jsdom.
    projects: [
      {
        extends: true,
        test: {
          name: 'core',
          environment: 'node',
          include: ['src/core/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: [
            'src/*.test.{ts,tsx}',
            'src/{ui,adapters,runtime,state,media}/**/*.test.{ts,tsx}',
          ],
        },
      },
    ],
  },
});
