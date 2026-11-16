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
var lastProgress = 0;

function send(msg, transfer) {
  if (port) port.postMessage(msg, transfer || []);
  else queue.push([msg, transfer || []]);
}
function errText(e) {
  return e && e.message ? String(e.message) : String(e);
}
// The line in the person's own code where an error happened, read from the error's stack (the code is loaded under the
// name frameling-plugin:<id>, see load below). 0 when there is none to read.
function lineOf(e) {
  var m = e && typeof e.stack === 'string' ? /frameling-plugin:[^:\s)]*:(\d+):(\d+)/.exec(e.stack) : null;
  return m ? Number(m[1]) : 0;
}
function words(v) {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return String(v.message || v);
  try {
    var t = JSON.stringify(v);
    return t === undefined ? String(v) : t;
  } catch (e) {
    return String(v);
  }
}
var logWindow = 0;
var logCount = 0;
function logLine(level, args) {
  // A loop that prints for ever must not bury the port: only so many lines a second leave the worker.
  var now = Date.now();
  if (now - logWindow >= 1000) {
    logWindow = now;
    logCount = 0;
  }
  if (++logCount > 100) return;
  var out = [];
  for (var i = 0; i < args.length; i++) out.push(words(args[i]));
  send({ t: 'log', level: level, text: out.join(' ').slice(0, 500) });
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
      send({ t: 'reply', id: m.id, ok: false, error: errText(e), line: lineOf(e) });
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
    // What is picked right now: { frame, layerId, drawingId, shapes: [the shapes picked] }.
    selected: function () {
      return call('document.selected');
    },
  },
  // Pressing Frameling's own commands. Needs the 'app' permission.
  app: {
    // Every command a script may press: [{ id, label, category, description, keys, enabled }].
    commands: function () {
      return call('app.commands');
    },
    // Presses one by its id and waits for it to finish.
    run: function (id) {
      return call('app.run', { id: String(id) });
    },
    // Chooses what commands act on: { frame, layerId, selection: [shape ids], color, fillColor }.
    set: function (what) {
      return call('app.set', what && typeof what === 'object' ? what : {});
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
  // Tells Frameling how far a long command or export has got, so it is not mistaken for a plugin that is stuck. It is
  // posted straight away, so it works from inside a long loop too. Calls come through at most ten times a second.
  progress: function (done, total) {
    var now = Date.now();
    done = Number(done);
    total = Number(total);
    if (!isFinite(done) || !isFinite(total)) return;
    if (now - lastProgress < 100 && done < total) return;
    lastProgress = now;
    send({ t: 'progress', done: done, total: total });
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

// Finds the line of a syntax error by handing the same code to a throwaway worker, which stops at the mistake and says where.
// Calls done with the line, or 0 when it can't be found (no workers, or nothing said within a moment).
function syntaxLine(code, done) {
  var url = null;
  var w = null;
  var timer = null;
  var finished = false;
  function finish(line) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    try {
      if (w) w.terminate();
    } catch (e) {}
    try {
      if (url) URL.revokeObjectURL(url);
    } catch (e) {}
    done(line);
  }
  try {
    if (typeof Worker !== 'function') return done(0);
    url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    w = new Worker(url);
    w.onerror = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      finish(e && e.lineno > 0 ? e.lineno : 0);
    };
    timer = setTimeout(function () {
      finish(0);
    }, 1500);
  } catch (e) {
    finish(0);
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
  send({ t: 'error', message: errText(e.error || e.message), line: lineOf(e.error) || (e.lineno > 0 ? e.lineno : 0) });
});
self.addEventListener('unhandledrejection', function (e) {
  send({ t: 'error', message: errText(e.reason), line: lineOf(e.reason) });
});
// console.log and friends also go to whoever is running the code (a script's panel); it is the same console as before.
(function () {
  var c = self.console;
  if (!c) return;
  ['log', 'info', 'warn', 'error'].forEach(function (level) {
    var was = c[level];
    c[level] = function () {
      try {
        logLine(level, arguments);
      } catch (e) {}
      if (typeof was === 'function') return was.apply(c, arguments);
    };
  });
})();

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
    if (err && err.name === 'SyntaxError') {
      // A mistake in how the code is written. The error carries no line, but a worker given the same code reports one.
      syntaxLine(String(d.code), function (line) {
        send({ t: 'error', message: errText(err).replace(/^Failed to execute 'importScripts' on 'WorkerGlobalScope': /, ''), loading: true, line: line });
      });
    } else send({ t: 'error', message: errText(err), loading: true, line: lineOf(err) });
  }
};
`;

export const PRELUDE = `(function (self) {${PRELUDE_BODY}\n})(self);`;
