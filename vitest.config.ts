import { defineConfig } from 'vitest/config';

// Kept apart from vite.config.ts, whose root is the renderer folder.
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
