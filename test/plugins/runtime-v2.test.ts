// Version 2 from the host's side: the real prelude talks to the real host over a real MessagePort, and the host checks
// every message again. Events, tools, canvas guides, shapes, files and exporter options.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { parseManifest, type Permission } from '../../src/plugins/manifest';
import { PluginRuntime, TIMEOUTS, type HostHooks, type ShapePlacement } from '../../src/plugins/runtime';
import { MAX_UNANSWERED } from '../../src/plugins/events';
import { closeAll, runPlugin, settle } from './harness';

afterEach(closeAll);

type Log = string[] & { overlays: Record<string, unknown[]>; placed: ShapePlacement[] };

function hooks(over: Partial<HostHooks> = {}): HostHooks & { log: Log } {
  const log = Object.assign([] as string[], { overlays: {} as Record<string, unknown[]>, placed: [] as ShapePlacement[] });
  return {
    log,
    getDoc: () => newDoc({ name: 'Doc' }),
    getState: () => ({ frame: 0, activeLayerId: null, selection: [], drawingId: null }),
    edit: (label, ops) => void log.push(`edit:${label}:${JSON.stringify(ops)}`),
    notify: (m, k) => void log.push(`notify:${k}:${m}`),
    addCommand: (d) => void log.push(`command:${d.id}`),
    addExporter: (d) => void log.push(`exporter:${d.id}`),
    addPanel: (d) => void log.push(`panel:${d.id}`),
    updatePanel: () => undefined,
    problem: (m, loading) => void log.push(`problem:${loading ? 'load:' : ''}${m}`),
    addTool: (d) => void log.push(`tool:${d.id}:${d.icon}:${d.layers.join('+')}`),
    addShapeKind: (d) => void log.push(`shape:${d.kind}`),
    setOverlay: (t, l) => void (log.overlays[t] = l),
    placeShape: (p) => (log.placed.push(p), p.inst ?? 'inst-1'),
    pickFile: async () => ({ name: 'pic.svg', bytes: new Uint8Array([1, 2, 3]) }),
    subscriptionsChanged: () => void log.push('subs'),
    ...over,
  };
}

const manifest = (permissions: Permission[], more: Record<string, unknown> = {}) => parseManifest({ id: 'tst', name: 'T', version: '1', apiVersion: 2, permissions, ...more });

function start(code: string, permissions: Permission[], granted: Permission[] = permissions, more: Record<string, unknown> = {}, h = hooks()) {
  const w = runPlugin(code);
  const rt = new PluginRuntime(manifest(permissions, more), granted, w.transport, h);
  return { rt, h, w };
}

describe('events', () => {
  const code = `frameling.events.on('frame.changed', (e) => frameling.ui.notify('frame ' + e.frame));
    frameling.events.on('selection.changed', (e) => frameling.ui.notify('sel ' + e.count + ' ' + JSON.stringify(e.ids)));`;

  it('delivers only what the manifest lists and the plugin asked for', async () => {
    const { rt, h } = start(code, [], [], { events: ['frame.changed'] });
    await settle();
    expect([...rt.subscribed]).toEqual(['frame.changed']);
    // It asked for one the manifest does not list: told off, and never sent.
    expect(h.log.filter((l) => l.startsWith('problem:'))).toHaveLength(1);
    rt.emit('frame.changed', { frame: 7 });
    rt.emit('selection.changed', { count: 1, ids: ['a'] });
    rt.emit('export.started', {});
    await settle();
    expect(h.log).toContain('notify:info:frame 7');
    expect(h.log.some((l) => l.includes('sel '))).toBe(false);
  });

  it('gives the ids of the selection only to a plugin that may see the drawing', async () => {
    const a = start(code, ['document.read'], ['document.read'], { events: ['selection.changed'] });
    await settle();
    a.rt.emit('selection.changed', { count: 2, ids: ['s1', 's2'] });
    await settle();
    expect(a.h.log).toContain('notify:info:sel 2 ["s1","s2"]');
    const b = start(code, [], [], { events: ['selection.changed'] });
    await settle();
    b.rt.emit('selection.changed', { count: 2, ids: ['s1', 's2'] });
    await settle();
    expect(b.h.log).toContain('notify:info:sel 2 undefined');
  });

  it('tells the host when the plugin starts and stops listening, and builds the summary only when it sends', async () => {
    const { rt, h } = start(`const f = () => {}; frameling.events.on('document.changed', f); frameling.events.off('document.changed', f);`, [], [], { events: ['document.changed'] });
    await settle();
    expect(h.log.filter((l) => l === 'subs')).toHaveLength(2);
    expect(rt.subscribed.size).toBe(0);
    let built = 0;
    rt.emit('document.changed', () => (built++, {}));
    expect(built).toBe(0);
  });

  it('stops telling a plugin that never answers', async () => {
    // A handler that never finishes holds up the next event; the host counts the ones not yet answered.
    const { rt, h } = start(`frameling.events.on('export.started', () => new Promise(() => {}));`, [], [], { events: ['export.started'] });
    await settle();
    // The gate lets 40 a second through; the clock is moved on so the count of unanswered ones can build up.
    let t = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => t);
    try {
      for (let i = 0; i < MAX_UNANSWERED + 20; i++) {
        if (i % 30 === 29) t += 1100;
        rt.emit('export.started', { i });
      }
    } finally {
      clock.mockRestore();
    }
    await settle();
    expect(h.log.filter((l) => l.includes('not keeping up'))).toHaveLength(1);
  });
});

describe('tools', () => {
  const tool = `frameling.tools.register({ id: 'pen2', label: 'Pen 2', icon: 'pen', layers: ['vector', 'bogus'] }, async (e) => {
    if (e.type === 'down') return { overlay: [{ type: 'line', x1: e.x, y1: e.y, x2: e.x + 5, y2: e.y, stroke: '#ff0000' }, { type: 'eval', code: 'x' }], hint: 'down at ' + e.x };
    if (e.type === 'up') return { label: 'Fade', ops: [{ op: 'setLayer', layerId: 'L', opacity: 0.5 }] };
  });`;
  const ev = (type: 'down' | 'up', x = 3) => ({ type, x, y: 4, pressure: 0.5, shift: false, alt: false, mod: false, button: 0, frame: 0, drawingId: null, zoom: 1 }) as const;

  it('registers a tool when it was allowed, and hears the pointer in stage coordinates', async () => {
    const { rt, h } = start(tool, ['tools']);
    await settle();
    expect(h.log).toContain('tool:pen2:pen:vector');
    const hint = await rt.toolEvent('pen2', ev('down', 12));
    expect(hint).toBe('down at 12');
    // The picture the plugin sent is checked: what Frameling does not know is dropped.
    expect(h.log.overlays['tool:pen2']).toEqual([{ type: 'line', x1: 12, y1: 4, x2: 17, y2: 4, stroke: '#ff0000' }]);
  });

  it('applies the edits a tool answers with only if it may change the drawing', async () => {
    const yes = start(tool, ['tools', 'document.edit']);
    await settle();
    await yes.rt.toolEvent('pen2', ev('up'));
    expect(yes.h.log).toContain('edit:Fade:[{"op":"setLayer","layerId":"L","opacity":0.5}]');
    const no = start(tool, ['tools', 'document.edit'], ['tools']);
    await settle();
    const hint = await no.rt.toolEvent('pen2', ev('up'));
    expect(no.h.log.some((l) => l.startsWith('edit:'))).toBe(false);
    expect(hint).toMatch(/wasn't allowed/);
  });

  it('says what went wrong when the edits are refused', async () => {
    const { rt } = start(tool, ['tools', 'document.edit'], ['tools', 'document.edit'], {}, hooks({ edit: () => { throw new Error("There's no layer \"L\"."); } }));
    await settle();
    expect(await rt.toolEvent('pen2', ev('up'))).toMatch(/no layer/);
  });

  it('leaves the tool out when the person refused it, and lets the rest of the plugin run; a plugin that never asked is told off', async () => {
    const code = `${tool}\nframeling.commands.register({ id: 'hi', label: 'Hi' }, () => frameling.ui.notify('still here'));`;
    const denied = start(code, ['tools'], []);
    await settle();
    expect(denied.h.log.some((l) => l.startsWith('tool:'))).toBe(false);
    expect(denied.h.log.some((l) => l.startsWith('problem:'))).toBe(false);
    expect(denied.h.log).toContain('command:hi');
    await denied.rt.runCommand('hi');
    await settle();
    expect(denied.h.log).toContain('notify:info:still here');
    expect(await denied.rt.toolEvent('pen2', ev('down'))).toBeUndefined();
    const never = start(code, []);
    await settle();
    expect(never.h.log.filter((l) => l.startsWith('problem:'))).toHaveLength(1);
  });

  it('gives up on a tool that keeps not answering', async () => {
    const old = TIMEOUTS.toolEvent;
    TIMEOUTS.toolEvent = 25;
    try {
      const { rt, h } = start(`frameling.tools.register({ id: 'slow', label: 'Slow' }, () => new Promise(() => {}));`, ['tools']);
      await settle();
      for (let i = 0; i < 5; i++) await rt.toolEvent('slow', ev('down'));
      expect(h.log.filter((l) => l.includes('not answering'))).toHaveLength(1);
    } finally {
      TIMEOUTS.toolEvent = old;
    }
  });
});

describe('canvas guide', () => {
  it('shows a checked draw list, and is refused without the power', async () => {
    const code = `frameling.canvas.overlay([{ type: 'rect', x: 1, y: 2, w: 3, h: 4, stroke: '#00ff00' }, { type: 'bogus' }]);`;
    const a = start(code, ['canvas']);
    await settle();
    expect(a.h.log.overlays.canvas).toEqual([{ type: 'rect', x: 1, y: 2, w: 3, h: 4, stroke: '#00ff00' }]);
    const denied = start(code, ['canvas'], []);
    await settle();
    expect(denied.h.log.overlays.canvas).toBeUndefined();
    expect(denied.h.log.some((l) => l.startsWith('problem:'))).toBe(false);
    const never = start(code, []);
    await settle();
    expect(never.h.log.overlays.canvas).toBeUndefined();
    expect(never.h.log.some((l) => l.startsWith('problem:'))).toBe(true);
  });

  it('drops pictures sent faster than the limit', async () => {
    let n = 0;
    const { rt } = start(`for (let i = 0; i < 200; i++) frameling.canvas.overlay([{ type: 'line', x1: 0, y1: 0, x2: i, y2: 0 }]);`, ['canvas'], ['canvas'], {}, hooks({ setOverlay: () => void n++ }));
    await settle();
    expect(rt.running).toBe(true);
    expect(n).toBeLessThanOrEqual(30);
    expect(n).toBeGreaterThan(0);
  });
});

describe('shapes', () => {
  const code = `frameling.shapes.register({ kind: 'badge', label: 'Badge' }, (p) => [{ type: 'ellipse', cx: 0, cy: 0, rx: p.r, ry: p.r, fill: p.color }, { type: 'nope' }]);
    frameling.commands.register({ id: 'add', label: 'Add' }, async () => {
      const inst = await frameling.shapes.place('badge', { r: 9, color: '#ff0000' }, { x: 10, y: 20 });
      await frameling.shapes.update(inst, 'badge', { r: 12, color: '#00ff00' });
      try { await frameling.shapes.place('missing', {}); } catch (e) { await frameling.ui.notify('no: ' + e.message); }
      try { await frameling.shapes.place('badge', { big: 'x'.repeat(70000) }); } catch (e) { await frameling.ui.notify('big: ' + e.message); }
    });`;

  it('asks the plugin to draw from the settings it stored, and hands Frameling a checked draw list', async () => {
    const { rt, h } = start(code, ['shapes']);
    await settle();
    expect(h.log).toContain('shape:badge');
    await rt.runCommand('add');
    await settle();
    expect(h.log.placed).toHaveLength(2);
    expect(h.log.placed[0]).toMatchObject({ pluginId: 'tst', kind: 'badge', props: { r: 9, color: '#ff0000' }, at: { x: 10, y: 20 }, drawn: [{ type: 'ellipse', cx: 0, cy: 0, rx: 9, ry: 9, fill: '#ff0000' }] });
    expect(h.log.placed[1]).toMatchObject({ inst: 'inst-1', props: { r: 12 } });
    expect(h.log.some((l) => l.startsWith('notify:info:no: This plugin has no kind of shape'))).toBe(true);
    expect(h.log.some((l) => l.startsWith('notify:info:big: '))).toBe(true);
  });

  it('is refused without the power', async () => {
    const { rt, h } = start(code, ['shapes'], []);
    await settle();
    expect(h.log.some((l) => l.startsWith('shape:'))).toBe(false);
    await rt.runCommand('add');
    await settle();
    expect(h.log.placed).toHaveLength(0);
    expect(h.log.some((l) => l.startsWith('problem:'))).toBe(true);
  });

  it('does not let a plugin add shapes faster than a person could use them', async () => {
    const { rt, h } = start(`frameling.shapes.register({ kind: 'dot' }, () => [{ type: 'rect', x: 0, y: 0, w: 1, h: 1 }]);
      frameling.commands.register({ id: 'flood', label: 'Flood' }, async () => {
        let refused = 0;
        for (let i = 0; i < 60; i++) { try { await frameling.shapes.place('dot', {}); } catch (e) { refused++; } }
        await frameling.ui.notify('refused ' + refused);
      });`, ['shapes']);
    await settle();
    await rt.runCommand('flood');
    await settle();
    expect(h.log.placed).toHaveLength(20);
    expect(h.log).toContain('notify:info:refused 40');
  });

  it('gives up on a shape that takes too long to draw', async () => {
    const old = TIMEOUTS.shapeDraw;
    TIMEOUTS.shapeDraw = 25;
    try {
      const { rt, h } = start(`frameling.shapes.register({ kind: 'slow' }, () => new Promise(() => {})); frameling.commands.register({ id: 'go', label: 'Go' }, async () => { await frameling.shapes.place('slow', {}); });`, ['shapes']);
      await settle();
      await rt.runCommand('go');
      await settle();
      expect(h.log.placed).toHaveLength(0);
      expect(h.log.some((l) => l.includes('took too long'))).toBe(true);
    } finally {
      TIMEOUTS.shapeDraw = old;
    }
  });
});

describe('files', () => {
  const code = `frameling.commands.register({ id: 'pick', label: 'Pick' }, async () => {
    const f = await frameling.files.pick({ extensions: ['svg', 'bad ext'], title: 'Pick a picture' });
    await frameling.ui.notify(f ? f.name + ' ' + f.bytes.length : 'none');
  });`;

  it('reads only the file the person picked', async () => {
    const asked: unknown[] = [];
    const { rt, h } = start(code, ['files.read'], ['files.read'], {}, hooks({ pickFile: async (o) => (asked.push(o), { name: '../pic.svg', bytes: new Uint8Array([1, 2, 3]) }) }));
    await settle();
    await rt.runCommand('pick');
    await settle();
    expect(asked).toEqual([{ extensions: ['svg'], title: 'Pick a picture' }]);
    expect(h.log).toContain('notify:info:_pic.svg 3');
  });

  it('says none when they cancel, and is refused without the power', async () => {
    const a = start(code, ['files.read'], ['files.read'], {}, hooks({ pickFile: async () => null }));
    await settle();
    await a.rt.runCommand('pick');
    await settle();
    expect(a.h.log).toContain('notify:info:none');
    const b = start(code, ['files.read'], []);
    await settle();
    await b.rt.runCommand('pick');
    await settle();
    expect(b.h.log.some((l) => l.includes('notify:info:'))).toBe(false);
    expect(b.h.log.some((l) => l.startsWith('problem:'))).toBe(true);
  });
});

describe('exporter options', () => {
  const opts = [{ id: 'n', type: 'number', label: 'N', min: 1, max: 5, default: 2 }, { id: 'loud', type: 'switch', label: 'Loud' }];
  const code = `frameling.exporters.register({ id: 'e', label: 'E', extension: 'txt' }, async (frames, info, options) => [{ name: 'x.txt', text: JSON.stringify(options) }]);`;

  it('passes the values to the export call, checked against what the manifest described', async () => {
    const { rt } = start(code, ['export'], ['export'], { exporters: { e: { options: opts } } });
    await settle();
    expect(rt.exporters.get('e')?.options.map((o) => o.id)).toEqual(['n', 'loud']);
    const info = { name: 'd', fps: 12, width: 1, height: 1, scale: 1, frameNumbers: [0], clips: [], markers: [] };
    const files = await rt.runExport('e', [{ width: 1, height: 1, data: new Uint8ClampedArray(4) }], info, undefined, { n: 99, loud: 'yes', junk: 1 });
    expect(new TextDecoder().decode(files[0].bytes)).toBe('{"n":5,"loud":false}');
    const none = await rt.runExport('e', [{ width: 1, height: 1, data: new Uint8ClampedArray(4) }], info);
    expect(new TextDecoder().decode(none[0].bytes)).toBe('{"n":2,"loud":false}');
  });

  it('takes the options from the register call when the manifest has none, but only for version 2', async () => {
    const withOpts = `frameling.exporters.register({ id: 'e', label: 'E', extension: 'txt', options: ${JSON.stringify(opts)} }, async () => []);`;
    expect(start(withOpts, ['export']).rt.exporters.size).toBe(0);
    const a = start(withOpts, ['export']);
    await settle();
    expect(a.rt.exporters.get('e')?.options).toHaveLength(2);
    const v1 = runPlugin(withOpts);
    const rt = new PluginRuntime(parseManifest({ id: 'tst', name: 'T', version: '1', permissions: ['export'] }), ['export'], v1.transport, hooks());
    await settle();
    expect(rt.exporters.get('e')?.options).toEqual([]);
  });
});

describe('permissions()', () => {
  it('tells a plugin which of its powers it was given', async () => {
    const { h } = start(`frameling.permissions().then((p) => frameling.ui.notify(p.join(',')));`, ['tools', 'canvas', 'panels'], ['panels', 'tools']);
    await settle();
    expect(h.log).toContain('notify:info:tools,panels');
  });
});

describe('version 1 plugins', () => {
  it('cannot use version 2 powers, and are told so', async () => {
    const w = runPlugin(`frameling.tools.register({ id: 'a', label: 'A' }, () => {}); frameling.events.on('frame.changed', () => {}); frameling.canvas.overlay([{ type: 'line', x1: 0, y1: 0, x2: 1, y2: 1 }]);`);
    const h = hooks();
    new PluginRuntime(parseManifest({ id: 'old', name: 'Old', version: '1', permissions: ['document.read'] }), ['document.read'], w.transport, h);
    await settle();
    expect(h.log.filter((l) => l.startsWith('problem:')).length).toBe(3);
    expect(h.log.some((l) => l.startsWith('tool:'))).toBe(false);
    expect(h.log.overlays.canvas).toBeUndefined();
  });
});
