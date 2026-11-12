// Version 2 example: an exporter with options, and events about exports.
// The options are described in manifest.json. Frameling shows them in the Export dialog, remembers what was used, and
// passes the checked values as the third argument to the export function.

frameling.exporters.register({ id: 'report', label: 'Frame report (text)', extension: 'txt', multiple: false, transparent: false }, async (frames, info, options) => {
  const lines = [options.title, '='.repeat(options.title.length), `${info.name}: ${frames.length} frames at ${info.fps} fps, ${info.width} x ${info.height}`, ''];
  frames.forEach((f, i) => {
    if (i % options.every !== 0) return;
    const n = info.frameNumbers[i];
    lines.push(options.style === 'times' ? `${(n / info.fps).toFixed(3)} s` : `Frame ${n + 1}`);
  });
  if (options.markers && info.markers.length) {
    lines.push('', 'Markers:');
    for (const m of info.markers) lines.push(`- ${m.name} (frame ${m.frame + 1})`);
  }
  return [{ name: 'report.txt', text: lines.join('\n') + '\n' }];
});

frameling.events.on('export.finished', (e) => {
  if (e.ok) frameling.ui.notify(`Finished a ${e.format} export.`, 'info');
});
