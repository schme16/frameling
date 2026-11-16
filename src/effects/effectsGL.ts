/**
 * The GPU path for the per-pixel effects (see kernels.ts for the maths, which the shaders here repeat): the layer goes
 * up as a texture, one draw makes the result, and it is drawn back onto the layer's canvas. No pixels are read back,
 * so a 1080p frame with grain or a long motion blur stays fast. One shared WebGL2 context per page (or worker).
 * Returns false whenever it can't (no WebGL2, context lost), and the caller falls back to the software path.
 */
import type { Canvas2, Ctx } from './apply';
import { MOTION_MAX_SAMPLES, type KernelKind, type KernelParams } from './kernels';

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Textures hold premultiplied colour, one texel per canvas pixel, row 0 at the top. `p` is the pixel's centre.
const HEAD = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uSrc;
uniform vec4 uA;
uniform vec4 uB;
uniform vec2 uC;
uniform int uI;
uniform int uN;
out vec4 o;
ivec2 sz;
vec4 tex(ivec2 q) {
  return texelFetch(uSrc, clamp(q, ivec2(0), sz - 1), 0);
}
vec4 bil(vec2 p) {
  vec2 f = p - 0.5;
  vec2 i = floor(f);
  vec2 w = f - i;
  ivec2 q = ivec2(i);
  return mix(mix(tex(q), tex(q + ivec2(1, 0)), w.x), mix(tex(q + ivec2(0, 1)), tex(q + ivec2(1, 1)), w.x), w.y);
}
uint hash3(int x, int y, int z) {
  uint h = uint(x) * 374761393u + uint(y) * 668265263u + uint(z) * 2246822519u;
  h = (h ^ (h >> 13)) * 1274126177u;
  return h ^ (h >> 16);
}
float hash01(int x, int y, int z) {
  return float(hash3(x, y, z) >> 8) / 16777216.0;
}
void main() {
  sz = textureSize(uSrc, 0);
  vec2 p = vec2(gl_FragCoord.x, float(sz.y) - gl_FragCoord.y);
`;

const BODY: Record<KernelKind, string> = {
  grain: `
  vec4 s = tex(ivec2(floor(p)));
  if (s.a <= 0.0) { o = vec4(0.0); return; }
  int cx = int(floor((p.x - uA.z) / uA.y));
  int cy = int(floor((p.y - uA.w) / uA.y));
  int base = uI * 4;
  float l = hash01(cx, cy, base) * 2.0 - 1.0;
  vec3 n = vec3(
    l + (hash01(cx, cy, base + 1) * 2.0 - 1.0 - l) * uB.x,
    l + (hash01(cx, cy, base + 2) * 2.0 - 1.0 - l) * uB.x,
    l + (hash01(cx, cy, base + 3) * 2.0 - 1.0 - l) * uB.x);
  o = vec4(clamp(s.rgb + n * uA.x * s.a, vec3(0.0), vec3(s.a)), s.a);`,
  wave: `
  float t = dot(p - uC, uB.zw) * uA.y + uA.z;
  float s = sin(t) * uA.x;
  float c = cos(t) * uA.x * uA.w;
  o = bil(p + uB.xy * s + uB.zw * c);`,
  fringe: `
  vec4 r = bil(p - uA.xy);
  vec4 g = bil(p);
  vec4 b = bil(p + uA.xy);
  o = vec4(r.r, g.g, b.b, max(r.a, max(g.a, b.a)));`,
  vignette: `
  vec2 n = (p - uA.xy) / uA.zw;
  float t = clamp((length(n) * 0.70710678 - uC.x) / (uC.y - uC.x), 0.0, 1.0);
  float k = uB.w * t * t * (3.0 - 2.0 * t);
  vec4 s = tex(ivec2(floor(p)));
  o = vec4(uB.rgb * k + s.rgb * (1.0 - k), k + s.a * (1.0 - k));`,
  motionblur: `
  vec4 acc = vec4(0.0);
  float step = uN > 1 ? (uA.w - uA.z) / float(uN - 1) : 0.0;
  for (int i = 0; i < ${MOTION_MAX_SAMPLES}; i++) {
    if (i >= uN) break;
    float s = uA.z + step * float(i);
    acc += bil(p + uA.xy * s) / float(uN);
  }
  o = acc;`,
};

interface Prog {
  prog: WebGLProgram;
  loc: Record<'uSrc' | 'uA' | 'uB' | 'uC' | 'uI' | 'uN', WebGLUniformLocation | null>;
}

interface Gpu {
  gl: WebGL2RenderingContext;
  canvas: Canvas2;
  tex: WebGLTexture;
  vs: WebGLShader;
  progs: Partial<Record<KernelKind, Prog>>;
}

let gpu: Gpu | null | undefined;
/** Turns the GPU path off (tests, or a diagnosis); the software path is used instead. */
let disabled = false;
/** How many effects the GPU drew (for tests and tuning). */
export const effectsGpuStats = { runs: 0 };

export function setEffectsGpu(on: boolean): void {
  disabled = !on;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

function make(): Gpu | null {
  try {
    const canvas: Canvas2 =
      typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : typeof document !== 'undefined' ? document.createElement('canvas') : (null as never);
    if (!canvas) return null;
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }) as WebGL2RenderingContext | null;
    if (!gl) return null;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const tex = gl.createTexture();
    if (!vs || !tex) return null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    canvas.addEventListener?.('webglcontextlost', () => {
      gpu = null;
    });
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.disable(gl.BLEND);
    return { gl, canvas, tex, vs, progs: {} };
  } catch {
    return null;
  }
}

/** The shader for an effect, built the first time it is wanted. */
function program(g: Gpu, kind: KernelKind): Prog | null {
  const have = g.progs[kind];
  if (have) return have;
  const { gl } = g;
  const fs = compile(gl, gl.FRAGMENT_SHADER, `${HEAD}${BODY[kind]}\n}`);
  const prog = gl.createProgram();
  if (!fs || !prog) return null;
  gl.attachShader(prog, g.vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  const at = (n: string) => gl.getUniformLocation(prog, n);
  return (g.progs[kind] = { prog, loc: { uSrc: at('uSrc'), uA: at('uA'), uB: at('uB'), uC: at('uC'), uI: at('uI'), uN: at('uN') } });
}

/** Draws the effect of `src` onto the cleared `out` (the same size). False when the GPU can't do it here. */
export function runEffectGpu(src: Canvas2, out: Canvas2, p: KernelParams): boolean {
  if (disabled) return false;
  if (gpu === undefined || (gpu === null && gpuRetry())) gpu = make();
  if (!gpu) return false;
  const { gl, canvas } = gpu;
  const w = src.width;
  const h = src.height;
  if (!w || !h || out.width !== w || out.height !== h || gl.isContextLost()) return false;
  try {
    const pr = program(gpu, p.kind);
    if (!pr) return false;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.useProgram(pr.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gpu.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.uniform1i(pr.loc.uSrc, 0);
    gl.uniform4f(pr.loc.uA, ...p.a);
    gl.uniform4f(pr.loc.uB, ...p.b);
    gl.uniform2f(pr.loc.uC, ...p.c);
    gl.uniform1i(pr.loc.uI, p.i);
    gl.uniform1i(pr.loc.uN, p.n);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const g = out.getContext('2d') as Ctx;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'copy';
    g.drawImage(canvas as CanvasImageSource, 0, 0);
    g.restore();
    effectsGpuStats.runs++;
    return true;
  } catch {
    return false;
  }
}

/** After a lost context, try again at most once in a while. */
let lastTry = 0;
function gpuRetry(): boolean {
  const now = Date.now();
  if (now - lastTry < 2000) return false;
  lastTry = now;
  return true;
}
