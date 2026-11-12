import { defineConfig } from 'vitest/config';

// Kept apart from vite.config.ts, whose root is the renderer folder. UI tests opt into jsdom with
// `// @vitest-environment jsdom` at the top of the file.
// The timeouts are generous on purpose: one worker per file means ~25 jsdom workers at once, and parallel agents build on
// the same machine. A test that needs 1s alone (help-words, toolArrange) went past the 5s default when the CPU was busy.
// A real hang still fails, only later.
export default defineConfig({ test: { include: ['test/**/*.test.ts', 'test/**/*.test.tsx'], setupFiles: ['test/setup-kinds.ts'], testTimeout: 30_000, hookTimeout: 30_000 } });
