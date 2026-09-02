import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom does not implement object URLs. Provide inert fakes; tests that assert on the
// lifecycle spy on these directly.
URL.createObjectURL = vi.fn(() => `blob:softview/${Math.random().toString(36).slice(2)}`);
URL.revokeObjectURL = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});
