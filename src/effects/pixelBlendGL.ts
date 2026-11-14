/**
 * The GPU path for the pixel-mixed blend modes (see pixelBlend.ts for the maths, which this repeats in a shader):
 * the backdrop and the layer go up as textures, one draw mixes them, and the result is drawn back with 'copy'. No
 * pixels are read back, so a 1080p frame with several such layers stays fast. One shared WebGL2 context per page
 * (or worker). Returns false whenever it can't (no WebGL2, context lost), and the caller falls back to the CPU path.
 */
import type { BlendMode } from '../core/format';
import type { Canvas2, Ctx } from './apply';

const MODES: Partial<Record<BlendMode, number>> = { 'linear-dodge': 0, subtract: 1, divide: 2 };

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Textures hold premultiplied colour. Un-premultiply, mix with the W3C formula, premultiply again.
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uBack;
uniform sampler2D uTop;
uniform int uMode;
uniform float uAlpha;
out vec4 o;
vec3 mixed(vec3 b, vec3 s) {
  if (uMode == 0) return min(b + s, vec3(1.0));
  if (uMode == 1) return max(b - s, vec3(0.0));
  vec3 q = b / max(s, vec3(1e-6));
  return mix(mix(q, vec3(1.0), greaterThanEqual(b, s)), vec3(0.0), equal(b, vec3(0.0)));
}
void main() {
  ivec2 size = textureSize(uBack, 0);
  ivec2 p = ivec2(int(gl_FragCoord.x), size.y - 1 - int(gl_FragCoord.y));
  vec4 b = texelFetch(uBack, p, 0);
  vec4 t = texelFetch(uTop, p, 0);
  float as = t.a * uAlpha;
  if (as <= 0.0) { o = b; return; }
  float ab = b.a;
  // Straight colour in whole bytes, as the CPU path (and Aseprite) see it; Divide magnifies the rounding at soft edges.
  vec3 cb = ab > 0.0 ? floor(min(b.rgb / ab, 1.0) * 255.0 + 0.5) / 255.0 : vec3(0.0);
  vec3 cs = t.a > 0.0 ? floor(min(t.rgb / t.a, 1.0) * 255.0 + 0.5) / 255.0 : vec3(0.0);
  float ar = as + ab - as * ab;
  float k = as / ar;
  vec3 v = (1.0 - k) * cb + k * ((1.0 - ab) * cs + ab * mixed(cb, cs));
  // Round the straight result to bytes first, like the CPU path, then premultiply for the canvas.
  float aq = floor(ar * 255.0 + 0.5) / 255.0;
  o = vec4(floor(v * 255.0 + 0.5) / 255.0 * aq, aq);
}`;

interface Gpu {
  gl: WebGL2RenderingContext;
  canvas: Canvas2;
  prog: WebGLProgram;
  back: WebGLTexture;
  top: WebGLTexture;
  uMode: WebGLUniformLocation | null;
  uAlpha: WebGLUniformLocation | null;
}

let gpu: Gpu | null | undefined;
/** Turns the GPU path off (tests, or a diagnosis); the CPU path is used instead. */
let disabled = false;
/** How many blits the GPU did (for tests and tuning). */
export const gpuStats = { blits: 0 };

export function setPixelBlendGpu(on: boolean): void {
  disabled = !on;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

function texture(gl: WebGL2RenderingContext): WebGLTexture | null {
  const t = gl.createTexture();
  if (!t) return null;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function make(): Gpu | null {
  try {
    const canvas: Canvas2 =
      typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : typeof document !== 'undefined' ? document.createElement('canvas') : (null as never);
    if (!canvas) return null;
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }) as WebGL2RenderingContext | null;
    if (!gl) return null;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    const back = texture(gl);
    const top = texture(gl);
    if (!vs || !fs || !prog || !back || !top) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    canvas.addEventListener?.('webglcontextlost', () => {
      gpu = null;
    });
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.disable(gl.BLEND);
    return { gl, canvas, prog, back, top, uMode: gl.getUniformLocation(prog, 'uMode'), uAlpha: gl.getUniformLocation(prog, 'uAlpha') };
  } catch {
    return null;
  }
}

/** Mixes canvas `top` onto the canvas behind `g` with the pixel blend `mode`. False when the GPU can't do it here. */
export function blitPixelsGpu(g: Ctx, top: Canvas2, mode: BlendMode, alpha: number): boolean {
  const m = MODES[mode];
  if (disabled || m === undefined) return false;
  if (gpu === undefined || (gpu === null && gpuRetry())) gpu = make();
  if (!gpu) return false;
  const { gl, canvas } = gpu;
  const w = top.width;
  const h = top.height;
  const back = g.canvas as Canvas2;
  if (!back || back.width !== w || back.height !== h || gl.isContextLost()) return false;
  try {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.useProgram(gpu.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gpu.back);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, back);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, gpu.top);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, top);
    gl.uniform1i(gl.getUniformLocation(gpu.prog, 'uBack'), 0);
    gl.uniform1i(gl.getUniformLocation(gpu.prog, 'uTop'), 1);
    gl.uniform1i(gpu.uMode, m);
    gl.uniform1f(gpu.uAlpha, alpha);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'copy';
    g.drawImage(canvas as CanvasImageSource, 0, 0);
    g.restore();
    gpuStats.blits++;
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
