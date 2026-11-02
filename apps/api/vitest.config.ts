import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    // Integration tests share one test database, so files run one at a time.
    fileParallelism: false,
    // bcrypt at cost 12 is deliberately slow.
    testTimeout: 20_000,
  },
});
