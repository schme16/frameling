// The plugin's side of the bridge: runs first inside the plugin's worker and gives its script the `frameling` object.
// Kept as a plain string so it can be handed to the sandbox as is. PRELUDE_BODY is a function body taking `self`
// (tests run it in Node with a stand-in `self`); PRELUDE wraps it for a real worker.
//
// Everything here is a convenience for plugin authors. The host checks every message again, since a plugin can talk
// to the port in any way it likes.

export const PRELUDE_BODY = String.raw`
'use strict';
var port = null;
var queue = [];
var nextId = 1;
var pending = new Map();
var commands = new Map();
var exporters = new Map();
var panels = new Map();
var tools = new Map();
var shapeKinds = new Map();
var listeners = new Map();
var info = null;

function send(msg, transfer) {
  if (port) port.postMessage(msg, transfer || []);
  else queue.push([msg, transfer || []]);
}
function errText(e) {
  return e && e.message ? String(e.message) : String(e);
}
function call(method, args, transfer) {
  return new Promise(function (resolve, reject) {
    var id = nextId++;
    pending.set(id, { resolve: resolve, reject: reject });
    send({ t: 'call', id: id, method: method, args: args }, transfer);
  });
}
function buffersOf(v, out) {
  if (!v || typeof v !== 'object') return out;
  if (ArrayBuffer.isView(v)) {
    if (out.indexOf(v.buffer) < 0 && v.byteOffset === 0 && v.byteLength === v.buffer.byteLength) out.push(v.buffer);
    return out;
  }
  if (Array.isArray(v)) {
    for (var i = 0; i < v.length && i < 1000; i++) buffersOf(v[i], out);
    return out;
  }
  for (var k in v) if (k === 'bytes' || k === 'data' || k === 'pixels' || k === 'image') buffersOf(v[k], out);
  return out;
}
function needId(def, what) {
  if (!def || typeof def.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(def.id)) throw new Error(what + ' needs an id made of letters, numbers, dashes or underscores.');
  if (typeof def.label !== 'string' && typeof def.title !== 'string') throw new Error(what + ' needs a label.');
}
async function serve(method, a) {
  if (method === 'command') {
    var run = commands.get(a && a.id);
    if (!run) throw new Error('This plugin has no command "' + (a && a.id) + '".');
    await run();
    return null;
  }
  if (method === 'export') {
    var ex = exporters.get(a && a.id);
    if (!ex) throw new Error('This plugin has no exporter "' + (a && a.id) + '".');
    var files = await ex(a.frames, a.info, a.options || {});
    return Array.isArray(files) ? files : files ? [files] : [];
  }
  if (method === 'toolEvent') {
    var tool = tools.get(a && a.toolId);
    if (!tool) return null;
    var out = await tool(a.event);
    return out && typeof out === 'object' ? { ops: out.ops, label: out.label, overlay: out.overlay, hint: out.hint } : null;
  }
  if (method === 'shapeDraw') {
    var draw = shapeKinds.get(a && a.kind);
    if (!draw) throw new Error('This plugin has no kind of shape "' + (a && a.kind) + '".');
    return (await draw(a.props || {})) || [];
  }
  if (method === 'panelEvent') {
    var p = panels.get(a && a.panelId);
    if (p) await p({ id: a.id, value: a.value });
    return null;
  }
  throw new Error('Unknown request "' + method + '".');
}
async function onMessage(m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'ping') {
    // The host's heartbeat: a worker stuck in a loop can't answer it.
    send({ t: 'pong', n: m.n });
    return;
  }
  if (m.t === 'event') {
    var fns = listeners.get(m.name);
    if (fns) {
      for (var i = 0; i < fns.length; i++) {
        try {
          await fns[i](m.payload);
        } catch (e) {
          send({ t: 'error', message: errText(e) });
        }
      }
    }
    send({ t: 'evAck' });
    return;
  }
  if (m.t === 'reply') {
    var p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.value);
    else p.reject(new Error(m.error));
    return;
  }
  if (m.t === 'call') {
    try {
      var value = await serve(m.method, m.args);
      send({ t: 'reply', id: m.id, ok: true, value: value }, buffersOf(value, []));
    } catch (e) {
      send({ t: 'reply', id: m.id, ok: false, error: errText(e) });
    }
  }
}

var api = {
  apiVersion: 2,
  get plugin() {
    return info;
  },
  commands: {
    register: function (def, run) {
      needId(def, 'A command');
      if (typeof run !== 'function') throw new Error('A command needs a function to run.');
      commands.set(def.id, run);
      send({ t: 'register', kind: 'command', def: { id: def.id, label: def.label, description: def.description, keys: def.keys } });
    },
  },
  document: {
    get: function () {
      return call('document.get');
    },
    state: function () {
      return call('ui.state');
    },
    edit: function (label, ops) {
      if (Array.isArray(label)) {
        ops = label;
        label = '';
      }
      return call('document.edit', { label: String(label || ''), ops: ops });
    },
  },
  exporters: {
    register: function (def, run) {
      needId(def, 'An exporter');
      if (typeof run !== 'function') throw new Error('An exporter needs a function that makes the files.');
      exporters.set(def.id, run);
      send({ t: 'register', kind: 'exporter', def: { id: def.id, label: def.label, description: def.description, extension: def.extension, multiple: def.multiple, transparent: def.transparent, options: def.options } });
    },
  },
  panels: {
    register: function (def, ui, onEvent) {
      needId(def, 'A panel');
      panels.set(def.id, typeof onEvent === 'function' ? onEvent : null);
      send({ t: 'register', kind: 'panel', def: { id: def.id, title: def.title || def.label }, ui: ui });
      return {
        update: function (next) {
          send({ t: 'panel', id: def.id, ui: next });
        },
      };
    },
  },
  ui: {
    notify: function (message, kind) {
      return call('ui.notify', { message: String(message), kind: kind });
    },
  },
  // Version 2. Which of its powers the person allowed (it can ask for more than it was given).
  permissions: function () {
    return call('permissions').then(function (r) {
      return r.granted;
    });
  },
  events: {
    on: function (name, fn) {
      if (typeof fn !== 'function') throw new Error('events.on needs a function.');
      var list = listeners.get(name);
      if (!list) {
        list = [];
        listeners.set(name, list);
        send({ t: 'subscribe', event: String(name) });
      }
      list.push(fn);
    },
    off: function (name, fn) {
      var list = listeners.get(name);
      if (!list) return;
      var i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
      if (!list.length) {
        listeners.delete(name);
        send({ t: 'unsubscribe', event: String(name) });
      }
    },
  },
  tools: {
    register: function (def, onEvent) {
      needId(def, 'A tool');
      if (typeof onEvent !== 'function') throw new Error('A tool needs a function that hears the pointer.');
      tools.set(def.id, onEvent);
      send({ t: 'register', kind: 'tool', def: { id: def.id, label: def.label, icon: def.icon, layers: def.layers, snap: def.snap, keys: def.keys } });
    },
  },
  canvas: {
    // A guide drawn on top of the canvas: a list of lines, boxes, ellipses, polygons, paths and text. null takes it away.
    overlay: function (list) {
      send({ t: 'overlay', list: Array.isArray(list) ? list : [] });
    },
  },
  shapes: {
    register: function (def, draw) {
      if (!def || typeof def.kind !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(def.kind)) throw new Error('A kind of shape needs a kind made of letters, numbers, dashes or underscores.');
      if (typeof draw !== 'function') throw new Error('A kind of shape needs a function that draws it from its settings.');
      shapeKinds.set(def.kind, draw);
      send({ t: 'register', kind: 'shape', def: { id: def.kind, label: def.label, options: def.options } });
    },
    place: function (kind, props, at) {
      return call('shapes.place', { kind: String(kind), props: props || {}, x: at && at.x, y: at && at.y });
    },
    update: function (inst, kind, props, drawingId) {
      return call('shapes.update', { inst: String(inst), kind: String(kind), props: props || {}, drawingId: drawingId });
    },
  },
  files: {
    // Asks the person to pick a file, and reads only that one. Resolves { name, bytes } or null if they cancel.
    pick: function (opts) {
      opts = opts || {};
      return call('files.pick', { extensions: opts.extensions, title: opts.title });
    },
  },
};

var BLOCKED = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport', 'indexedDB', 'caches'];
function harden(network) {
  if (network) return;
  // The sandbox's Content Security Policy is what really stops these. This just makes the answer clearer.
  var no = function () {
    throw new Error('This plugin did not ask to use the internet.');
  };
  for (var i = 0; i < BLOCKED.length; i++) {
    var name = BLOCKED[i];
    for (var o = self; o; o = Object.getPrototypeOf(o)) {
      var d = Object.getOwnPropertyDescriptor(o, name);
      if (d && d.configurable) {
        try {
          delete o[name];
        } catch (e) {}
      }
    }
    try {
      Object.defineProperty(self, name, { value: no, writable: false, configurable: false });
    } catch (e) {}
  }
}

function load(code, id) {
  if (typeof self.__framelingLoad === 'function') return self.__framelingLoad(code, api);
  var url = URL.createObjectURL(new Blob([code + '\n//# sourceURL=frameling-plugin:' + id], { type: 'text/javascript' }));
  try {
    importScripts(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

self.addEventListener('error', function (e) {
  send({ t: 'error', message: errText(e.error || e.message) });
});
self.addEventListener('unhandledrejection', function (e) {
  send({ t: 'error', message: errText(e.reason) });
});

self.onmessage = function (e) {
  var d = e.data;
  if (port || !d || d.t !== 'boot' || !e.ports || !e.ports[0]) return;
  self.onmessage = null;
  port = e.ports[0];
  info = Object.freeze({ id: String(d.plugin.id), name: String(d.plugin.name), version: String(d.plugin.version) });
  port.onmessage = function (ev) {
    onMessage(ev.data);
  };
  var q = queue;
  queue = [];
  for (var i = 0; i < q.length; i++) port.postMessage(q[i][0], q[i][1]);
  harden(!!d.network);
  try {
    Object.defineProperty(self, 'frameling', { value: Object.freeze(api), writable: false, configurable: false });
  } catch (e2) {}
  try {
    load(String(d.code), info.id);
    send({ t: 'loaded' });
  } catch (err) {
    send({ t: 'error', message: errText(err), loading: true });
  }
};
`;

export const PRELUDE = `(function (self) {${PRELUDE_BODY}\n})(self);`;
