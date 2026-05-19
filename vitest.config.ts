import { defineConfig } from 'vitest/config';

// Default test config: unit + snapshot tests across packages.
// Runtime tests (which require regenerating the petstore SDK) live in
// `tests/runtime/` and are run separately via `npm run test:runtime`.
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
  },
});
