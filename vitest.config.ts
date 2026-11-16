import { defineConfig } from 'vitest/config';

// Kept apart from vite.config.ts, whose root is the renderer folder. UI tests opt into jsdom with
// `// @vitest-environment jsdom` at the top of the file.
// The timeouts are generous on purpose: one worker per file means ~25 jsdom workers at once, and parallel agents build on
// the same machine. A test that needs 1s alone (help-words, toolArrange) went past the 5s default when the CPU was busy.
// Measured with four full suites at once: svg "copies without end" took 20 to 38 s (3.5 s alone), help-words 27 s, the
// artboards fuzz 25 s, so 30 s was a guess that load broke. Waits for a condition use their own ceiling (test/helpers/waits.ts).
// A real hang still fails, only later.
// The cache sits in the checkout itself, never in node_modules. Every build worktree symlinks node_modules to the one
// shared folder, so a cache in there means parallel agents trip over each other's files and a run dies on a missing
// entry another run has just swept. A folder per worktree keeps them apart. It is in .gitignore.
export default defineConfig({ cacheDir: '.vitest-cache', test: { include: ['test/**/*.test.ts', 'test/**/*.test.tsx'], setupFiles: ['test/setup-kinds.ts'], testTimeout: 120_000, hookTimeout: 60_000 } });
