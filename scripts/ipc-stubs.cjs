// The one set of main-process stand-ins for every Electron harness that does not run the real main process
// (shoot.cjs, a11y.cjs, scripts/e2e/*.cjs, scripts/docs/*). Each channel the page can call is answered here with a
// harmless value, so a new channel never logs "No handler registered". test/platform/ipc-stubs.test.ts compares the
// lists below with the channels in src/main and src/preload, so `npm test` fails when a channel is added without a stub.
//
//   const { installIpcStubs } = require('./ipc-stubs.cjs');
//   const stubs = installIpcStubs(ipcMain, { 'plugins:isolated': () => true });   // overrides win over the defaults
//
// Overrides can also replace 'send' channels. The in-memory library (plugins, templates, versions) is returned as
// `stubs.library`, and `stubs.clearLibrary()` empties it.

const noError = () => ({ ok: true });

/** Channels the page calls with invoke(): name -> handler (given the event, then the arguments). */
function invokeStubs(library) {
  const own = (kind) => [...library.keys()].filter((k) => k.startsWith(kind + '/'));
  // A pretend recent list, so a page that opens drawings or keeps their pictures sees them in Open recent. Nothing is on disk.
  const recent = [];
  const pictures = new Map();
  return {
    'files:open': () => null,
    'files:read': () => ({ error: 'No such file.' }),
    'files:save': () => null,
    'files:pickExportFile': () => null,
    'files:pickExportFolder': () => null,
    'files:write': noError,
    'files:writeMany': () => ({ paths: [] }),
    'files:showInFolder': () => undefined,
    'files:openOther': () => null,
    'files:readFolder': () => null,
    'files:linkPlayable': () => undefined,
    'media:aacAvailable': () => false,
    'media:toAac': () => null,
    'recent:list': () => recent.map((path, i) => ({ path, name: String(path).split('/').pop().replace(/\.[^.]*$/, ''), openedAt: Date.now() - (i * 7 + 1) * 3600000 })),
    'recent:add': (_e, p) => void recent.splice(0, recent.length, p, ...recent.filter((x) => x !== p)),
    'recent:remove': (_e, p) => void recent.splice(0, recent.length, ...recent.filter((x) => x !== p)),
    'recent:clear': () => void recent.splice(0, recent.length),
    'recent:preview': (_e, p) => (pictures.has(p) ? { state: 'picture', url: 'data:image/png;base64,' + Buffer.from(pictures.get(p)).toString('base64') } : { state: 'none' }),
    'recent:keepPreview': (_e, p, png) => void pictures.set(p, png),
    'autosave:write': () => true,
    'autosave:read': () => null,
    'autosave:clear': () => true,
    'autosave:keep': () => true,
    'autosave:listKept': () => [],
    'autosave:readKept': () => null,
    'autosave:removeKept': () => true,
    'app:launchFile': () => null,
    'app:display': () => null,
    'app:lastCrash': () => null,
    'app:askSaveChanges': () => 'discard',
    'library:list': (_e, kind) => own(kind).map((k) => ({ id: k.slice(kind.length + 1), size: library.get(k).length, modified: 0 })),
    'library:read': (_e, kind, id) => library.get(`${kind}/${id}`) ?? null,
    'library:write': (_e, kind, id, bytes) => void library.set(`${kind}/${id}`, bytes),
    'library:remove': (_e, kind, id) => void library.delete(`${kind}/${id}`),
    'library:showFolder': () => undefined,
    'fonts:psNames': () => [],
    'plugins:memory': () => ({}),
    'plugins:isolated': () => false,
    'plugins:setDiagnostics': () => undefined,
    'video:probe': () => ({ ok: false, reason: 'No FFmpeg in the test harness.' }),
    'video:start': () => ({ error: 'No FFmpeg in the test harness.' }),
    'video:frame': () => ({ error: 'No FFmpeg in the test harness.' }),
    'video:finish': () => ({ error: 'No FFmpeg in the test harness.' }),
    'video:cancel': () => undefined,
    'beta:request': () => ({ code: 'ERR_BLOCKED_BY_CLIENT', message: 'No board in the test harness.' }),
    // The graphics report: a fixed, ordinary one (a card drawing through Vulkan), so pictures of the Performance page are the same every run.
    'gpu:report': () => ({
      platform: 'linux', arch: 'x64', electron: '45.0.0', chromium: '140.0.0.0',
      devices: [{ vendorId: 0x10de, deviceId: 0x2702, active: true, name: 'NVIDIA GeForce RTX 4070', driver: 'NVIDIA 580.65.06' }],
      glRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070/PCIe/SSE2, OpenGL 4.5.0 NVIDIA 580.65.06)', glVersion: 'OpenGL ES 3.1', glImplementation: '(gl=egl-angle,angle=vulkan)', skia: 'Ganesh',
      features: { gpu_compositing: 'enabled', '2d_canvas': 'enabled_on', rasterization: 'enabled_on', vulkan: 'enabled_on' },
      hardwareAcceleration: true, flags: ['--ignore-gpu-blocklist', '--enable-features=Vulkan,DefaultANGLEVulkan'],
      off: { file: false, env: false, path: '/home/you/.config/Frameling/gpu-off' }, gpuKb: 318 * 1024, appKb: 842 * 1024, vramBytes: 12 * 1024 ** 3,
    }),
    'gpu:setHardware': () => ({ ok: true, path: '/home/you/.config/Frameling/gpu-off' }),
    'app:restart': () => ({ ok: true }),
    'app:restore': () => null,
    'update:facts': () => ({ how: 'page', beta: false, why: '', version: '0.0.1', platform: 'linux', arch: 'x64', canCheck: false }),
    'update:releases': () => ({ ok: true, releases: [] }),
    'update:install': () => ({ ok: false, message: 'Not in a harness.' }),
    'update:openPage': () => undefined,
    'update:finish': () => undefined,
    'clipboard:readPicture': () => null,
    'clipboard:writePicture': () => false,
    'clipboard:writeText': () => false,
  };
}

/** Channels the page sends with ipcRenderer.send() (no answer). */
const SEND_CHANNELS = ['app:documentState', 'app:crashOffered', 'app:keepUnsavedDone', 'app:saveBeforeCloseDone', 'app:closeQuestionShown', 'app:closeQuestionAnswer'];

/** Every channel stubbed by default, for the drift test. */
const STUBBED_INVOKE = Object.keys(invokeStubs(new Map()));
const STUBBED_SEND = [...SEND_CHANNELS];

function installIpcStubs(ipcMain, overrides = {}) {
  const library = new Map();
  const table = { ...invokeStubs(library) };
  for (const [ch, fn] of Object.entries(overrides)) if (!SEND_CHANNELS.includes(ch)) table[ch] = fn;
  for (const [ch, fn] of Object.entries(table)) ipcMain.handle(ch, fn);
  for (const ch of SEND_CHANNELS) ipcMain.on(ch, overrides[ch] ?? (() => {}));
  return { library, clearLibrary: () => library.clear() };
}

module.exports = { installIpcStubs, STUBBED_INVOKE, STUBBED_SEND };
