import { defineConfig } from 'vitest/config';

// Kept apart from vite.config.ts, whose root is the renderer folder. UI tests opt into jsdom with
// `// @vitest-environment jsdom` at the top of the file.
// The timeouts are generous on purpose: one worker per file means ~25 jsdom workers at once, and parallel agents build on
// the same machine. A test that needs 1s alone (help-words, toolArrange) went past the 5s default when the CPU was busy.
// Measured with four full suites at once: svg "copies without end" took 20 to 38 s (3.5 s alone), help-words 27 s, the
// artboards fuzz 25 s, so 30 s was a guess that load broke. Waits for a condition use their own ceiling (test/helpers/waits.ts).
// A real hang still fails, only later.
export default defineConfig({ test: { include: ['test/**/*.test.ts', 'test/**/*.test.tsx'], setupFiles: ['test/setup-kinds.ts'], testTimeout: 120_000, hookTimeout: 60_000 } });
