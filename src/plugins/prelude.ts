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
    var files = await ex(a.frames, a.info);
    return Array.isArray(files) ? files : files ? [files] : [];
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
  apiVersion: 1,
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
      send({ t: 'register', kind: 'exporter', def: { id: def.id, label: def.label, description: def.description, extension: def.extension, multiple: def.multiple, transparent: def.transparent } });
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
