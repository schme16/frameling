import { defineConfig } from 'vitest/config';

// Kept apart from vite.config.ts, whose root is the renderer folder. UI tests opt into jsdom with
// `// @vitest-environment jsdom` at the top of the file.
export default defineConfig({ test: { include: ['test/**/*.test.ts', 'test/**/*.test.tsx'] } });
