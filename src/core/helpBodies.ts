// Every built-in help topic's words, as one lazily loaded chunk: each `*.bodies.ts` file next to a topic list exports
// `bodies` (topic id to Markdown). Only src/core/registry.ts imports this, with `import()`, when Help first needs them.
const files = import.meta.glob<Record<string, string>>('../**/*.bodies.ts', { eager: true, import: 'bodies' });

export const allBodies: Record<string, string> = Object.assign({}, ...Object.values(files));
