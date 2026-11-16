import { readFileSync } from 'node:fs';
import { zipSync, zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readBrushFile, sniff } from '../../src/brushes/import';
import { inflateCapped, unzlibCapped } from '../../src/brushes/import/inflate';
import { routeOf } from '../../src/brushes/import/krita';
import { parseXml } from '../../src/brushes/import/xml';
import { cleanDab } from '../../src/dab/maths';
import { encodePng, makeChunk, PNG_SIGNATURE } from '../../src/io/png';

const fx = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../fixtures/brushes/krita/${n}`, import.meta.url)));
const text = (s: string): Uint8Array => new TextEncoder().encode(s);

/** A .kpp built by hand: a 1 by 1 PNG with the settings in a text chunk. */
function kpp(xml: string, how: 'tEXt' | 'zTXt' = 'tEXt'): Uint8Array {
  const png = encodePng({ width: 1, height: 1, pixels: new Uint8ClampedArray([0, 0, 0, 255]) });
  const data = how === 'tEXt' ? new Uint8Array([...text('preset\0'), ...text(xml)]) : new Uint8Array([...text('preset\0\0'), ...zlibSync(text(xml))]);
  const chunk = makeChunk(how, data);
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, 33));
  out.set(chunk, 33);
  out.set(png.subarray(33), 33 + chunk.length);
  return out;
}

const param = (name: string, value: string): string => `<param name="${name}" type="string"><![CDATA[${value}]]></param>`;
const auto = (mg = 'diameter="30" ratio="1" hfade="1" vfade="1" id="default" type="circle" spikes="2" antialiasEdges="1"', extra = ''): string =>
  `<Brush type="auto_brush" spacing="0.1" angle="0" density="1" randomness="0" ${extra}><MaskGenerator ${mg}/></Brush>`;
function preset(opts: { name?: string; engine?: string; brush?: string; params?: string[] }): string {
  const brush = opts.brush ?? auto();
  return `<Preset name="${opts.name ?? 'Test'}" paintopid="${opts.engine ?? 'paintbrush'}">${param('brush_definition', brush)}${(opts.params ?? []).join('')}</Preset>`;
}
const sensor = (id: string, curve = '0,0;1,1;', extra = ''): string => `<!DOCTYPE params> <params id="${id}" ${extra}> <curve>${curve}</curve> </params>`;

const one = (xml: string) => {
  const r = readBrushFile(kpp(xml), 'x.kpp');
  if (!r.ok) throw new Error(r.error);
  return r.brushes[0];
};

describe('Krita .kpp', () => {
  it('reads a real preset: the default size-by-pressure round brush', () => {
    const r = readBrushFile(fx('Basic-5_Size_default.kpp'), 'Basic-5_Size_default.kpp');
    if (!r.ok) throw new Error(r.error);
    expect(r.brushes).toHaveLength(1);
    const b = r.brushes[0];
    expect(b.name).toBe('Basic-5 Size');
    expect(b.dab).toMatchObject({ tip: 'round', size: 40, hardness: 1, roundness: 1, spacing: 0.1, angle: 0 });
    // Both curves come with their bends: size holds back until a firm press, flow jumps almost at once.
    expect(b.dab.dynamics).toContainEqual({ from: 'pressure', to: 'size', amount: 1, invert: false, curve: [[0, 0], [0.35, 0.1], [1, 1]] });
    expect(b.dab.dynamics).toContainEqual({ from: 'pressure', to: 'flow', amount: 1, invert: false, curve: [[0, 0], [0.036, 0.266], [0.068, 0.995], [1, 1]] });
    // Krita's automatic spacing is the nearest thing here, and the note says so. Nothing is said about the curves: they came whole.
    expect(b.changed.join(' ')).toMatch(/spacing is automatic/);
    expect(b.changed.join(' ')).not.toMatch(/curve/);
    expect(b.dropped.join(' ')).not.toMatch(/curve/);
    expect(cleanDab(b.dab)).toEqual(b.dab);
  });

  it('reads the settings from a compressed text chunk as well as a plain one', () => {
    const a = readBrushFile(kpp(preset({ name: 'a)_Soft_Round' }), 'tEXt'), 'x.kpp');
    const b = readBrushFile(kpp(preset({ name: 'a)_Soft_Round' }), 'zTXt'), 'x.kpp');
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.brushes[0].name).toBe('Soft Round');
      expect(b.brushes[0].dab).toEqual(a.brushes[0].dab);
    }
  });

  it('generated tips: shape, size, flatness, angle in radians, softness', () => {
    const b = one(preset({ brush: auto('diameter="60" ratio="0.5" hfade="0.5" vfade="0.5" id="default" type="rect" spikes="2" antialiasEdges="1"').replace('angle="0"', 'angle="1.5708"') }));
    expect(b.dab).toMatchObject({ tip: 'square', size: 60, roundness: 0.5, hardness: 0.5, angle: 90 });
    expect(b.dropped).toEqual([]);
  });

  it('a hard edge with anti-aliasing off is all or nothing pixels', () => {
    const b = one(preset({ brush: auto('diameter="8" ratio="1" hfade="1" vfade="1" id="default" type="circle" spikes="2" antialiasEdges="0"') }));
    expect(b.dab.aliased).toBe(true);
  });

  it('a soft edge comes as a softness and says the curve is not kept', () => {
    const b = one(preset({ brush: auto('diameter="40" ratio="1" hfade="1" vfade="1" id="gauss" type="circle" spikes="2"') }));
    expect(b.dab.hardness).toBeLessThan(0.5);
    expect(b.changed.join(' ')).toMatch(/gaussian soft edge/);
  });

  it('says what it drops: spikes, density, randomness, a masking brush, an eraser, a blend mode, airbrush', () => {
    const b = one(
      preset({
        brush: auto('diameter="30" ratio="1" hfade="1" vfade="1" id="default" type="circle" spikes="5"', '').replace('density="1"', 'density="0.4"').replace('randomness="0"', 'randomness="0.5"'),
        params: [param('MaskingBrush/Enabled', 'true'), param('EraserMode', 'true'), param('CompositeOp', 'multiply'), param('AirbrushOption/isAirbrushing', 'true')],
      }),
    );
    const d = b.dropped.join(' | ');
    expect(d).toMatch(/5 spikes/);
    expect(d).toMatch(/density of 40%/);
    expect(d).toMatch(/randomness of 50%/);
    expect(d).toMatch(/masking brush/);
    expect(d).toMatch(/eraser/);
    expect(d).toMatch(/blend mode \(multiply\)/);
    expect(d).toMatch(/airbrush/);
  });

  describe('dynamics', () => {
    it('pen pressure, tilt, speed and chance become routes; an inverted curve is an inverted route', () => {
      const b = one(
        preset({
          params: [
            param('PressureSize', 'true'),
            param('SizeSensor', sensor('pressure', '0,0.25;1,1;')),
            param('PressureRotation', 'true'),
            param('RotationSensor', sensor('speed')),
            param('FlowUseCurve', 'true'),
            param('FlowSensor', sensor('declination', '0,1;1,0;')),
          ],
        }),
      );
      expect(b.dab.dynamics).toContainEqual({ from: 'pressure', to: 'size', amount: 0.75, invert: false });
      expect(b.dab.dynamics).toContainEqual({ from: 'speed', to: 'angle', amount: 1, invert: false });
      expect(b.dab.dynamics).toContainEqual({ from: 'tilt', to: 'flow', amount: 1, invert: true });
    });

    it('an option that is switched off is ignored', () => {
      const b = one(preset({ params: [param('PressureSize', 'false'), param('SizeSensor', sensor('pressure')), param('SizeUseCurve', 'true')] }));
      expect(b.dab.dynamics).toEqual([]);
    });

    it('several sensors on one option each become a route', () => {
      const list = '<!DOCTYPE params> <params id="sensorslist"> <ChildSensor id="speed"/> <ChildSensor id="pressure"> <curve>0,0;1,1;</curve> </ChildSensor> </params>';
      const b = one(preset({ params: [param('PressureSize', 'true'), param('SizeSensor', list)] }));
      expect(b.dab.dynamics.map((r) => r.from).sort()).toEqual(['pressure', 'speed']);
    });

    it('rotating with the direction you draw is "follow"', () => {
      const b = one(preset({ params: [param('PressureRotation', 'true'), param('RotationSensor', sensor('drawingangle'))] }));
      expect(b.dab.follow).toBe(true);
      expect(b.dab.dynamics).toEqual([]);
    });

    it('a fade runs for its length in dabs, as pixels of line', () => {
      const b = one(
        preset({
          params: [param('PressureSize', 'true'), param('SizeSensor', '<!DOCTYPE params> <params id="sensorslist"> <ChildSensor periodic="0" length="50" id="fade"> <curve>0,1;1,0;</curve> </ChildSensor> </params>')],
        }),
      );
      expect(b.dab.dynamics).toContainEqual({ from: 'fade', to: 'size', amount: 1, invert: true });
      // 50 dabs x spacing 0.1 x size 30
      expect(b.dab.fadeLength).toBe(150);
    });

    it('a bent curve is kept as the route curve, held to 0 to 1 across its range', () => {
      const b = one(preset({ params: [param('PressureSize', 'true'), param('SizeSensor', sensor('pressure', '0,0.2;0.3,0.9;1,1;'))] }));
      // Low 0.2, high 1: amount 0.8; the curve is the same line with 0.2 taken off the bottom and stretched.
      const r = b.dab.dynamics.find((x) => x.to === 'size');
      expect(r).toMatchObject({ from: 'pressure', amount: 0.8, invert: false });
      expect(r?.curve).toEqual([[0, 0], [0.3, 0.875], [1, 1]]);
      expect(b.changed.join(' ')).not.toMatch(/curve/);
    });

    it('a falling curve is an inverted route with its bend flipped to match', () => {
      const b = one(preset({ params: [param('PressureSize', 'true'), param('SizeSensor', sensor('pressure', '0,1;0.2,0.4;1,0;'))] }));
      const r = b.dab.dynamics.find((x) => x.to === 'size');
      expect(r).toMatchObject({ amount: 1, invert: true });
      expect(r?.curve).toEqual([[0, 0], [0.2, 0.6], [1, 1]]);
    });

    it('a curve that starts late or stops early holds its end heights out to 0 and 1', () => {
      const b = one(preset({ params: [param('PressureSize', 'true'), param('SizeSensor', sensor('pressure', '0.2,0;0.6,1;'))] }));
      const r = b.dab.dynamics.find((x) => x.to === 'size');
      expect(r?.curve?.[0]).toEqual([0, 0]);
      expect(r?.curve?.[r.curve.length - 1]).toEqual([1, 1]);
      expect(r?.curve).toContainEqual([0.2, 0]);
      expect(r?.curve).toContainEqual([0.6, 1]);
    });

    it('a straight curve leaves the route without one', () => {
      const b = one(preset({ params: [param('PressureSize', 'true'), param('SizeSensor', sensor('pressure', '0,0;0.5,0.5;1,1;'))] }));
      expect(b.dab.dynamics.find((x) => x.to === 'size')?.curve).toBeUndefined();
    });

    it('a long curve comes as its nearest 8 points and says so', () => {
      const pts = Array.from({ length: 12 }, (_, i) => `${i / 11},${Math.sqrt(i / 11)}`).join(';') + ';';
      const b = one(preset({ params: [param('PressureSize', 'true'), param('SizeSensor', sensor('pressure', pts))] }));
      expect(b.dab.dynamics.find((x) => x.to === 'size')?.curve).toHaveLength(8);
      expect(b.changed.join(' ')).toMatch(/size curve for pen pressure had 12 points; it came as the nearest 8/);
    });

    it('nonsense and out-of-range curve points are mended or ignored, never trusted', () => {
      const wild = sensor('pressure', '0,-5;0.5,9;NaN,1;0.7,;abc;2,3;1,0.5;-1,2;');
      const b = one(preset({ params: [param('PressureSize', 'true'), param('SizeSensor', wild)] }));
      expect(cleanDab(b.dab)).toEqual(b.dab);
      for (const r of b.dab.dynamics) {
        expect(r.amount).toBeGreaterThanOrEqual(0);
        expect(r.amount).toBeLessThanOrEqual(1);
        for (const [x, y] of r.curve ?? []) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(1);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(1);
        }
      }
      // Garbage that leaves fewer than two points is a plain straight route, as a missing curve is.
      const none = one(preset({ params: [param('PressureSize', 'true'), param('SizeSensor', sensor('pressure', 'x,y;1;'))] }));
      expect(none.dab.dynamics).toContainEqual({ from: 'pressure', to: 'size', amount: 1, invert: false });
    });

    it('a curve that never moves the setting adds no route', () => {
      const b = one(preset({ params: [param('PressureSize', 'true'), param('SizeSensor', sensor('pressure', '0,0.5;1,0.5;'))] }));
      expect(b.dab.dynamics).toEqual([]);
    });

    it('routeOf gives the same answer however the points come in', () => {
      const a = routeOf([[0, 0], [0.3, 0.9], [1, 1]]);
      const b = routeOf([[1, 1], [0.3, 0.9], [0, 0]]);
      expect(b).toEqual(a);
    });

    it('inputs and settings Frameling has no place for are dropped by name', () => {
      const b = one(
        preset({
          params: [
            param('PressureSize', 'true'),
            param('SizeSensor', sensor('time')),
            param('PressureSoftness', 'true'),
            param('PressureMirror', 'true'),
            param('Pressureh', 'true'),
            param('PressureRotation', 'true'),
            param('RotationSensor', sensor('ascension')),
          ],
        }),
      );
      const d = b.dropped.join(' | ');
      expect(d).toMatch(/size control by time/);
      expect(d).toMatch(/softness dynamics/);
      expect(d).toMatch(/flip dynamics/);
      expect(d).toMatch(/hue dynamics/);
      expect(d).toMatch(/rotation control by the direction the pen leans/);
    });

    it('scatter keeps its amount, and says when pressure moved it', () => {
      const b = one(preset({ params: [param('PressureScatter', 'true'), param('ScatterValue', '0.3'), param('ScatterSensor', sensor('pressure', '0,1;1,0;'))] }));
      expect(b.dab.scatter).toBe(0.3);
      expect(b.dropped.join(' ')).toMatch(/scatter changing with pen pressure/);
    });
  });

  it('a texture comes as the medium paper and the name is only the last part of its path', () => {
    const b = one(
      preset({ params: [param('Texture/Pattern/Enabled', 'true'), param('Texture/Pattern/Strength', '0.6'), param('Texture/Pattern/Scale', '2'), param('Texture/Pattern/Name', 'bundle:///home/someone/paper-grain.png')] }),
    );
    expect(b.dab.grain).toMatchObject({ paper: 'medium', depth: 0.6, scale: 2 });
    expect(b.changed.join(' ')).toMatch(/texture "paper-grain.png" came as Frameling's medium paper/);
    expect(b.changed.join(' ')).not.toMatch(/someone/);
  });

  it('a smudge brush comes as its tip and says the smudging is gone', () => {
    const b = one(preset({ engine: 'colorsmudge' }));
    expect(b.dropped.join(' ')).toMatch(/smudging/);
  });

  it('a brush from another engine is refused with its name', () => {
    const r = readBrushFile(kpp(preset({ name: 'Sketchy', engine: 'sketchbrush' })), 'x.kpp');
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/"Sketch" brush engine/);
  });

  it('a preset that paints with a picture it does not carry says where to find it', () => {
    const r = readBrushFile(kpp(preset({ brush: '<Brush type="png_brush" filename="chalk.png" scale="1" spacing="0.1" angle="0"/>' })), 'x.kpp');
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/"chalk.png".*bundle/);
  });

  it('holds hostile numbers in range', () => {
    const b = one(
      preset({
        brush: auto('diameter="1e99" ratio="NaN" hfade="-4" vfade="900" id="default" type="circle" spikes="99999999"').replace('spacing="0.1"', 'spacing="-5"').replace('angle="0"', 'angle="1e300"'),
        params: [param('FlowValue', '99'), param('OpacityValue', '-3'), param('PressureScatter', 'true'), param('ScatterValue', '1e99')],
      }),
    );
    const d = b.dab;
    expect(d.size).toBeLessThanOrEqual(300);
    expect(d.roundness).toBeGreaterThanOrEqual(0.05);
    expect(d.hardness).toBeLessThanOrEqual(1);
    expect(d.hardness).toBeGreaterThanOrEqual(0);
    expect(d.spacing).toBeGreaterThanOrEqual(0.05);
    expect(d.flow).toBeLessThanOrEqual(1);
    expect(d.opacity).toBeGreaterThanOrEqual(0.05);
    expect(d.scatter).toBeLessThanOrEqual(2);
    expect(d.angle).toBeGreaterThanOrEqual(0);
    expect(d.angle).toBeLessThan(360);
    expect(cleanDab(d)).toEqual(d);
  });

  describe('a damaged or hostile file is refused in plain words', () => {
    const good = fx('Basic-5_Size_default.kpp');
    it('cut short', () => {
      const r = readBrushFile(good.subarray(0, 300), 'cut.kpp');
      expect(r).toMatchObject({ ok: false });
      if (!r.ok) expect(r.error).toMatch(/ends too soon|damaged|no Krita brush settings/);
    });
    it('a picture with no settings in it', () => {
      const r = readBrushFile(encodePng({ width: 2, height: 2, pixels: new Uint8ClampedArray(16) }), 'plain.kpp');
      expect(r).toMatchObject({ ok: false });
      if (!r.ok) expect(r.error).toMatch(/no Krita brush settings/);
    });
    it('settings that are not XML', () => {
      expect(readBrushFile(kpp('this is not xml <<<'), 'x.kpp')).toMatchObject({ ok: false });
      expect(readBrushFile(kpp('<Preset><param name="a">'), 'x.kpp')).toMatchObject({ ok: false });
    });
    it('settings that are XML but not a preset', () => {
      expect(readBrushFile(kpp('<html><body>hi</body></html>'), 'x.kpp')).toMatchObject({ ok: false });
    });
    it('settings nested far too deep', () => {
      const deep = '<Preset>' + '<a>'.repeat(500) + '</a>'.repeat(500) + '</Preset>';
      const r = readBrushFile(kpp(deep), 'x.kpp');
      expect(r).toMatchObject({ ok: false });
      if (!r.ok) expect(r.error).toMatch(/nested too deeply/);
    });
    it('a billion laughs of entities is never expanded', () => {
      const lol = '<!DOCTYPE lolz [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]><Preset name="&c;" paintopid="paintbrush"></Preset>';
      const t0 = Date.now();
      const r = readBrushFile(kpp(lol), 'x.kpp');
      expect(Date.now() - t0).toBeLessThan(1000);
      expect(r).toMatchObject({ ok: false });
    });
    it('a settings chunk that unpacks to a huge size is stopped, not unpacked', () => {
      const big = zlibSync(new Uint8Array(48 * 1024 * 1024));
      const png = encodePng({ width: 1, height: 1, pixels: new Uint8ClampedArray([0, 0, 0, 255]) });
      const chunk = makeChunk('zTXt', new Uint8Array([...text('preset\0\0'), ...big]));
      const f = new Uint8Array(png.length + chunk.length);
      f.set(png.subarray(0, 33));
      f.set(chunk, 33);
      f.set(png.subarray(33), 33 + chunk.length);
      const r = readBrushFile(f, 'bomb.kpp');
      expect(r).toMatchObject({ ok: false });
      if (!r.ok) expect(r.error).toMatch(/far more than a brush file ever holds/);
    });
    it('a chunk that says it is bigger than the file', () => {
      const f = new Uint8Array(good.subarray(0, 60));
      f.set([0x7f, 0xff, 0xff, 0xff], 33);
      expect(readBrushFile(f, 'x.kpp')).toMatchObject({ ok: false });
    });
    it('every flipped byte ends in an answer, never a throw', () => {
      for (let i = 0; i < 300; i++) {
        const f = new Uint8Array(good);
        const at = (i * 7919) % 6000;
        f[at] ^= 0xff;
        expect(() => readBrushFile(f, 'flip.kpp')).not.toThrow();
      }
    });
  });
});

describe('Krita .bundle', () => {
  const bundle = fx('small-set.bundle');

  it('reads a real bundle, with its pictures, and says what it left out', () => {
    const r = readBrushFile(bundle, 'small-set.bundle');
    if (!r.ok) throw new Error(r.error);
    expect(r.format).toBe('bundle');
    expect(r.setName).toBe('small-set');
    const names = r.brushes.map((b) => b.name);
    expect(names).toEqual(['Basic-5 Size', 'Pencil-1 Hard', 'Basic-6 Details', 'Pencil-4 Soft', 'Stamp Sparkles', 'Eraser Circle']);
    // The round marker is another engine.
    expect(r.notes.join(' ')).toMatch(/1 preset uses another Krita brush engine \(Round marker\)/);
    for (const b of r.brushes) expect(cleanDab(b.dab)).toEqual(b.dab);
  });

  it('a picture tip comes with its picture, scaled, and a grey one is shaded paint', () => {
    const r = readBrushFile(bundle, 'small-set.bundle');
    if (!r.ok) throw new Error(r.error);
    const b = r.brushes.find((x) => x.name === 'Basic-6 Details')!;
    expect(b.dab.tip).toBe('picture');
    expect(b.dab.picture?.soft).toBe(true);
    expect(b.dab.picture!.w).toBeLessThanOrEqual(32);
    expect(b.dab.picture!.colours.length).toBeGreaterThan(2);
    expect(b.changed.join(' ')).toMatch(/shrunk from 150 by 150/);
  });

  it('a pipe tip takes its first picture and says how many there were', () => {
    const r = readBrushFile(bundle, 'small-set.bundle');
    if (!r.ok) throw new Error(r.error);
    expect(r.brushes.find((x) => x.name === 'Pencil-4 Soft')!.dropped.join(' ')).toMatch(/pipe of 7 pictures/);
    // The fairy dust pipe says 4 pictures and holds one.
    expect(r.brushes.find((x) => x.name === 'Stamp Sparkles')!.dropped.join(' ')).toMatch(/pipe of 4 pictures \(the file holds only 1\)/);
  });

  it('a blend mode of erase is named', () => {
    const r = readBrushFile(bundle, 'small-set.bundle');
    if (!r.ok) throw new Error(r.error);
    expect(r.brushes.find((x) => x.name === 'Eraser Circle')!.dropped.join(' ')).toMatch(/blend mode \(erase\)/);
  });

  it('finds the bundle by its first bytes when the ending is missing', () => {
    expect(sniff(bundle, 'download')).toBe('bundle');
    expect(sniff(fx('Basic-5_Size_default.kpp'), 'download')).toBe('kpp');
    expect(sniff(fx('Basic-5_Size_default.kpp'), 'picture.png')).toBeNull();
  });

  describe('a damaged or hostile bundle is refused in plain words', () => {
    it('cut short (the list of contents is at the end)', () => {
      const r = readBrushFile(bundle.subarray(0, bundle.length - 300), 'x.bundle');
      expect(r).toMatchObject({ ok: false });
    });
    it('cut in the middle of the contents', () => {
      expect(() => readBrushFile(bundle.subarray(0, 100000), 'x.bundle')).not.toThrow();
      expect(readBrushFile(bundle.subarray(0, 100000), 'x.bundle')).toMatchObject({ ok: false });
    });
    it('is not a zip at all', () => {
      const r = readBrushFile(new Uint8Array(3000).fill(0x50), 'x.bundle');
      expect(r).toMatchObject({ ok: false });
    });
    it('a zip with no presets in it', () => {
      const z = zipSync({ 'patterns/a.png': new Uint8Array(10), 'meta.xml': text('<m/>') });
      const r = readBrushFile(z, 'x.bundle');
      expect(r).toMatchObject({ ok: false });
      if (!r.ok) expect(r.error).toMatch(/no brush presets/);
    });
    it('a preset that unpacks to far more than it should is stopped', () => {
      const z = zipSync({ 'paintoppresets/bomb.kpp': new Uint8Array(40 * 1024 * 1024) }, { level: 9 });
      expect(z.length).toBeLessThan(100000);
      const r = readBrushFile(z, 'x.bundle');
      expect(r).toMatchObject({ ok: false });
      if (!r.ok) expect(r.error).toMatch(/far more than/);
    });
    it('a list of contents that claims thousands of files', () => {
      const z = new Uint8Array(zipSync({ 'a.txt': text('hi') }));
      // Rewrite the count in the end record (offset 10 and 8) to 60000.
      const e = z.length - 22;
      const dv = new DataView(z.buffer);
      dv.setUint16(e + 8, 60000, true);
      dv.setUint16(e + 10, 60000, true);
      const r = readBrushFile(z, 'x.bundle');
      expect(r).toMatchObject({ ok: false });
      if (!r.ok) expect(r.error).toMatch(/far more than a brush set holds/);
    });
    it('an entry that points outside the file', () => {
      const z = new Uint8Array(zipSync({ 'paintoppresets/a.kpp': kpp(preset({})) }));
      const e = z.length - 22;
      const dv = new DataView(z.buffer);
      const dir = dv.getUint32(e + 16, true);
      dv.setUint32(dir + 42, 0x7ffffff0, true);
      expect(readBrushFile(z, 'x.bundle')).toMatchObject({ ok: false });
    });
    it('a tip picture that says it is enormous', () => {
      const png = bigHeaderPng(100000, 100000);
      const z = zipSync({ 'paintoppresets/a.kpp': kpp(preset({ brush: '<Brush type="png_brush" filename="huge.png" scale="1" spacing="0.1" angle="0"/>' })), 'brushes/huge.png': png });
      const r = readBrushFile(z, 'x.bundle');
      expect(r).toMatchObject({ ok: false });
      if (!r.ok) expect(r.error).toMatch(/which Frameling will not open/);
    });
    it('a tip picture that says it is small but unpacks to far more', () => {
      const png = pngWith(50, 50, zlibSync(new Uint8Array(40 * 1024 * 1024)));
      const z = zipSync({ 'paintoppresets/a.kpp': kpp(preset({ brush: '<Brush type="png_brush" filename="bomb.png" scale="1" spacing="0.1" angle="0"/>' })), 'brushes/bomb.png': png });
      const r = readBrushFile(z, 'x.bundle');
      expect(r).toMatchObject({ ok: false });
      if (!r.ok) expect(r.error).toMatch(/unpacks to far more/);
    });
    it('a tip picture that is empty', () => {
      const png = encodePng({ width: 8, height: 8, pixels: new Uint8ClampedArray(8 * 8 * 4).fill(255) });
      const z = zipSync({ 'paintoppresets/a.kpp': kpp(preset({ brush: '<Brush type="png_brush" filename="blank.png" scale="1" spacing="0.1" angle="0"/>' })), 'brushes/blank.png': png });
      const r = readBrushFile(z, 'x.bundle');
      expect(r).toMatchObject({ ok: false });
      if (!r.ok) expect(r.error).toMatch(/empty/);
    });
    it('every flipped byte ends in an answer, never a throw', () => {
      for (let i = 0; i < 200; i++) {
        const f = new Uint8Array(bundle);
        f[(i * 104729) % bundle.length] ^= 0xff;
        expect(() => readBrushFile(f, 'flip.bundle')).not.toThrow();
      }
    });
  });
});

/** A PNG whose header says w by h, 8 bit RGBA, with `idat` as its picture data. */
function pngWith(w: number, h: number, idat: Uint8Array): Uint8Array {
  const head = new Uint8Array(13);
  const dv = new DataView(head.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  head[8] = 8;
  head[9] = 6;
  const parts = [PNG_SIGNATURE, makeChunk('IHDR', head), makeChunk('IDAT', idat), makeChunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const x of parts) (out.set(x, p), (p += x.length));
  return out;
}
const bigHeaderPng = (w: number, h: number): Uint8Array => pngWith(w, h, zlibSync(new Uint8Array(16)));

describe('the careful pieces', () => {
  it('inflate stops at its ceiling', () => {
    const z = zlibSync(new Uint8Array(5 * 1024 * 1024));
    expect(() => unzlibCapped(z, 1024 * 1024, 'x')).toThrow(/far more than/);
    expect(unzlibCapped(z, 6 * 1024 * 1024, 'x').length).toBe(5 * 1024 * 1024);
  });
  it('inflate says a damaged stream is damaged', () => {
    expect(() => inflateCapped(new Uint8Array([7, 7, 7, 7, 7, 7]), 1000, 'x')).toThrow(/damaged/);
  });
  it('the XML reader does not follow a DOCTYPE or define entities', () => {
    const n = parseXml('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><a b="&e;">&e;</a>');
    expect(n.attrs.b).toBe('&e;');
    expect(n.text).toBe('&e;');
  });
  it('the XML reader reads attributes, CDATA, the five entities and character numbers', () => {
    const n = parseXml(`<?xml version="1.0"?><a x='1' y="a&amp;b"><![CDATA[<raw>]]><b/>&#65;&lt;</a>`);
    expect(n.attrs).toEqual({ x: '1', y: 'a&b' });
    expect(n.text).toBe('<raw>A<');
    expect(n.children).toHaveLength(1);
  });
  it('the XML reader refuses an unclosed or mismatched document', () => {
    expect(() => parseXml('<a><b></a>')).toThrow();
    expect(() => parseXml('<a>')).toThrow();
    expect(() => parseXml('')).toThrow();
  });
});
