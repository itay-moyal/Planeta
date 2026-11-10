import { defineConfig } from 'vitest/config';

// DB test files share one test database and wipe it, so they must not run in parallel.
export default defineConfig({ test: { fileParallelism: false } });
