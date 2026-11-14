// A deliberately badly behaved plugin, to see Frameling's watchdog work (docs/plugins.md, "When a plugin misbehaves").
// Run either command from the Plugins menu: Frameling notices, turns the plugin off and says so with a "Turn it on" button.

const kept = [];

// Never comes back: a loop with no end.
frameling.commands.register({ id: 'freeze', label: 'Runaway test: freeze', description: 'Gets stuck in a loop for ever.' }, () => {
  for (;;) {
    kept.length = kept.length;
  }
});

// Keeps asking for memory, 100 MB at a time, up to 2 GB (so it can't hurt even without a watchdog).
frameling.commands.register({ id: 'hog', label: 'Runaway test: use lots of memory', description: 'Grabs memory until Frameling stops it.' }, async () => {
  for (let i = 0; i < 20; i++) {
    const block = new Uint8Array(100 * 1024 * 1024);
    block.fill(1);
    kept.push(block);
    await new Promise((r) => setTimeout(r, 200));
  }
});
