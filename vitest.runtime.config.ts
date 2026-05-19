import { defineConfig } from 'vitest/config';

// Runtime tests exercise the *generated* SDK on disk.
// Kept separate from `npm test` because they require `ironic generate`
// to have run against the petstore fixture.
export default defineConfig({
  test: {
    include: ['tests/runtime/**/*.test.ts'],
    globalSetup: ['tests/runtime/global-setup.ts'],
  },
});
