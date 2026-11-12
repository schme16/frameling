// The sandbox boundary, from the host's side: the real prelude talks to the real host over a real MessagePort, and
// every message the plugin sends is checked again by the host.
import { afterEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { readPluginFiles, type Permission } from '../../src/plugins/manifest';
import { exportClips, normalizeFiles, PluginRuntime, type HostHooks } from '../../src/plugins/runtime';
import { closeAll, exampleFiles, runPlugin, settle } from './harness';

afterEach(closeAll);

function hooks(over: Partial<HostHooks> = {}): HostHooks & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    getDoc: () => newDoc({ name: 'Doc' }),
    getState: () => ({ frame: 0, activeLayerId: null, selection: [], drawingId: null }),
    edit: (label, ops) => void log.push(`edit:${label}:${JSON.stringify(ops)}`),
    notify: (m, k) => void log.push(`notify:${k}:${m}`),
    addCommand: (d) => void log.push(`command:${d.id}:${d.label}`),
    addExporter: (d) => void log.push(`exporter:${d.id}:${d.extension}`),
    addPanel: (d, ui) => void log.push(`panel:${d.id}:${ui.type}`),
    updatePanel: (id) => void log.push(`update:${id}`),
    problem: (m, loading) => void log.push(`problem:${loading ? 'load:' : ''}${m}`),
    loaded: () => void log.push('loaded'),
    ...over,
  };
}

const manifest = (permissions: Permission[]) => ({ id: 't', name: 'T', version: '1', description: '', author: '', main: 'main.js', permissions, network: [], apiVersion: 1, events: [], exporterOptions: {} });

function start(code: string, permissions: Permission[], h = hooks()) {
  const w = runPlugin(code);
  const rt = new PluginRuntime(manifest(permissions), permissions, w.transport, h);
  return { rt, h, w };
}

describe('plugin runtime', () => {
  it('registers commands and runs them, with the document read through the bridge', async () => {
    const { rt, h } = start(
      `frameling.commands.register({ id: 'hi', label: 'Say hi' }, async () => {
        const d = await frameling.document.get();
        await frameling.ui.notify('Hello ' + d.name);
      });`,
      ['document.read'],
    );
    await settle();
    expect(h.log).toContain('command:hi:Say hi');
    expect(h.log).toContain('loaded');
    await rt.runCommand('hi');
    await settle();
    expect(h.log).toContain('notify:info:Hello Doc');
  });

  it('refuses what the plugin did not ask for, whatever it sends', async () => {
    const { rt, h } = start(
      `frameling.commands.register({ id: 'x', label: 'X' }, async () => {
        try { await frameling.document.get(); } catch (e) { await frameling.ui.notify('read: ' + e.message); }
        try { await frameling.document.edit('Y', []); } catch (e) { await frameling.ui.notify('edit: ' + e.message); }
      });
      frameling.exporters.register({ id: 'e', label: 'E', extension: 'txt' }, () => []);
      frameling.panels.register({ id: 'p', title: 'P' }, { type: 'text', text: 'hi' });`,
      [],
    );
    await settle();
    expect(h.log.some((l) => l.startsWith('exporter:'))).toBe(false);
    expect(h.log.some((l) => l.startsWith('panel:'))).toBe(false);
    expect(h.log.filter((l) => l.startsWith('problem:')).length).toBe(2);
    await rt.runCommand('x');
    await settle();
    expect(h.log).toContain('notify:info:read: This plugin did not ask for permission to see the drawing.');
    expect(h.log).toContain('notify:info:edit: This plugin did not ask for permission to change the drawing.');
    expect(h.log.some((l) => l.startsWith('edit:'))).toBe(false);
  });

  it('ignores messages it does not understand, sent straight down the port', async () => {
    const h = hooks();
    const { rt } = start(
      `frameling.commands.register({ id: 'raw', label: 'Raw' }, () => {});`,
      ['document.read'],
      h,
    );
    await settle();
    // Whatever arrives on the host's side is checked: bogus kinds, bad ids, unknown methods.
    const recv = (rt as unknown as { receive(m: unknown): Promise<void> }).receive.bind(rt);
    await recv({ t: 'register', kind: 'command', def: { id: '../../x', label: 'Bad' } });
    await recv({ t: 'register', kind: 'tool', def: { id: 'tool', label: 'Tool' } });
    await recv({ t: 'panel', id: 'nope', ui: {} });
    await recv('just a string');
    await recv(null);
    expect(h.log.filter((l) => l.startsWith('command:'))).toEqual(['command:raw:Raw']);
    const replies: unknown[] = [];
    (rt as unknown as { transport: { post(m: unknown): void } }).transport = { post: (m: unknown) => void replies.push(m), onMessage() {}, close() {} } as never;
    await recv({ t: 'call', id: 1, method: 'files.read', args: { path: '/etc/passwd' } });
    expect(replies[0]).toMatchObject({ t: 'reply', id: 1, ok: false });
  });

  it('applies edits through the host, which can refuse them', async () => {
    const h = hooks({
      edit: (label, ops) => {
        if ((ops as unknown[]).length > 1) throw new Error('Too many');
        h.log.push(`edit:${label}`);
      },
    });
    const { rt } = start(
      `frameling.commands.register({ id: 'go', label: 'Go' }, async () => {
        await frameling.document.edit('One', [{ op: 'setDocument', name: 'A' }]);
        try { await frameling.document.edit('Two', [{}, {}]); } catch (e) { await frameling.ui.notify(e.message); }
      });`,
      ['document.edit'],
      h,
    );
    await settle();
    await rt.runCommand('go');
    await settle();
    expect(h.log).toContain('edit:One');
    expect(h.log).toContain('notify:info:Too many');
  });

  it('blocks the network inside the plugin unless it may use it', async () => {
    const { rt, h } = start(
      `frameling.commands.register({ id: 'net', label: 'Net' }, async () => {
        try { self.fetch('https://example.com'); await frameling.ui.notify('fetched'); } catch (e) { await frameling.ui.notify(e.message); }
      });`,
      [],
    );
    await settle();
    await rt.runCommand('net');
    await settle();
    expect(h.log).toContain('notify:info:This plugin did not ask to use the internet.');
  });

  it('says when a plugin fails to load, and stops answering once stopped', async () => {
    const { rt, h } = start(`throw new Error('Oops at start')`, []);
    await settle();
    expect(h.log).toContain('problem:load:Oops at start');
    rt.stop();
    expect(rt.running).toBe(false);
    await expect(rt.runExport('x', [], { name: 'n', fps: 1, width: 1, height: 1, scale: 1, frameNumbers: [], clips: [], markers: [] })).rejects.toThrow();
  });

  it('runs the flip example: a command and a panel that edit the active layer', async () => {
    const pkg = readPluginFiles(exampleFiles('flip-every-other-frame'));
    const doc = newDoc({ name: 'Walk' });
    const layer = doc.layers[0];
    layer.cels = [0, 1, 2, 3].map((i) => ({ id: 'c' + i, start: i, length: 1, drawingId: 'd' + i }));
    const h = hooks({ getDoc: () => doc, getState: () => ({ frame: 0, activeLayerId: layer.id, selection: [], drawingId: 'd0' }) });
    const w = runPlugin(pkg.code);
    const rt = new PluginRuntime(pkg.manifest, pkg.manifest.permissions, w.transport, h);
    await settle();
    expect(h.log).toContain('command:flip:Flip every other frame');
    expect(h.log).toContain('panel:flip:column');
    await rt.runCommand('flip');
    await settle();
    const edit = h.log.find((l) => l.startsWith('edit:'))!;
    expect(edit).toContain('"drawingId":"d1"');
    expect(edit).toContain('"drawingId":"d3"');
    expect(edit).not.toContain('"drawingId":"d0"');
    // The panel's button runs it too, and the panel is redrawn after.
    rt.panelEvent('flip', 'which', 'even');
    rt.panelEvent('flip', 'go', true);
    await settle(10);
    const edits = h.log.filter((l) => l.startsWith('edit:'));
    expect(edits[1]).toContain('"drawingId":"d0"');
    expect(h.log).toContain('update:flip');
  });

  it('runs the contact sheet example: frames in, a PNG and a PDF out', async () => {
    const pkg = readPluginFiles(exampleFiles('contact-sheet'));
    const h = hooks();
    const w = runPlugin(pkg.code);
    const rt = new PluginRuntime(pkg.manifest, pkg.manifest.permissions, w.transport, h);
    await settle();
    expect(h.log).toEqual(expect.arrayContaining(['exporter:png:png', 'exporter:pdf:pdf']));
    const frames = () => [0, 1, 2].map(() => ({ width: 8, height: 4, data: new Uint8ClampedArray(8 * 4 * 4).fill(200) }));
    const info = { name: 'Walk', fps: 12, width: 8, height: 4, scale: 1, frameNumbers: [0, 1, 2], clips: [], markers: [] };
    const png = await rt.runExport('png', frames(), info);
    expect(png).toHaveLength(1);
    expect(png[0].name).toBe('Walk-contact-sheet.png');
    expect([...png[0].bytes.slice(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
    const pdf = await rt.runExport('pdf', frames(), info);
    const text = new TextDecoder('latin1').decode(pdf[0].bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Subtype /Image');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });
});

describe('export files from a plugin', () => {
  it('keeps names plain and turns text and pictures into bytes', () => {
    const out = normalizeFiles(
      [
        { name: '../../etc/evil', text: 'x' },
        { name: 'a.png', image: { width: 1, height: 1, data: new Uint8ClampedArray(4) } },
        { name: 'a.png', bytes: new Uint8Array([1]) },
      ],
      'f.bin',
    );
    expect(out.map((f) => f.name)).toEqual(['_.._etc_evil', 'a.png', 'a_.png']);
    expect(out[0].bytes).toEqual(new TextEncoder().encode('x'));
    expect(() => normalizeFiles([{ name: 'x', image: { width: 2, height: 2, data: new Uint8Array(3) } }], 'f')).toThrow(/right size/);
    expect(() => normalizeFiles([], 'f')).toThrow(/no files/);
    expect(() => normalizeFiles('nope', 'f')).toThrow(/list/);
  });
});


describe('clips as an exporter plugin sees them', () => {
  const clips = exportClips([
    { name: 'idle', start: 0, end: 3, loop: true },
    { name: 'swing', start: 4, end: 7, loop: false, direction: 'pingpong', repeat: 3 },
    { name: 'hit', start: 8, end: 9, loop: false, direction: 'reverse' },
  ]);

  it('always has a direction and a repeat count, forward and once when the clip does not say', () => {
    expect(clips).toEqual([
      { name: 'idle', start: 0, end: 3, loop: true, direction: 'forward', repeat: 1 },
      { name: 'swing', start: 4, end: 7, loop: false, direction: 'pingpong', repeat: 3 },
      { name: 'hit', start: 8, end: 9, loop: false, direction: 'reverse', repeat: 1 },
    ]);
  });

  it('ignores a bad direction or repeat from an odd file', () => {
    expect(exportClips([{ name: 'x', start: 0, end: 1, loop: false, direction: 'sideways' as never, repeat: -4 }])[0]).toMatchObject({ direction: 'forward', repeat: 1 });
  });

  it('reaches the plugin in info.clips, next to the old fields', async () => {
    const { rt } = start(
      `frameling.exporters.register({ id: 'j', label: 'Clips', extension: 'json', multiple: false, transparent: false },
        async (frames, info) => [{ name: 'clips.json', text: JSON.stringify(info.clips) }]);`,
      ['export'],
    );
    await settle();
    const out = await rt.runExport('j', [], { name: 'Walk', fps: 12, width: 8, height: 4, scale: 1, frameNumbers: [], clips, markers: [] });
    expect(JSON.parse(new TextDecoder().decode(out[0].bytes))).toEqual(clips);
  });
});
