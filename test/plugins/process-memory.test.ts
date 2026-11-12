// Which process is which plugin's (src/main/pluginMemory.ts).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DIAGNOSTICS_FLAG, isolationWanted, pluginMemory, wantIsolation } from '../../src/main/pluginMemory';

const app = 'file:///x/dist/renderer/index.html?debug=1';
const host = (id: string, net = false) => `file:///x/dist/renderer/plugin-host${net ? '-net' : ''}.html?plugin=${id}`;

describe('plugin memory by process', () => {
  it('gives each plugin the size of the process its sandbox has to itself', () => {
    const out = pluginMemory(
      [{ url: app, pid: 10 }, { url: host('greedy'), pid: 20 }, { url: host('online', true), pid: 30 }],
      [{ pid: 10, workingSetKb: 150_000 }, { pid: 20, workingSetKb: 600_000 }, { pid: 30, workingSetKb: 90_000 }],
      1,
    );
    expect(out).toEqual({ greedy: 600_000 * 1024, online: 90_000 * 1024 });
  });

  it('says nothing where a process is shared with another plugin or with the app', () => {
    const out = pluginMemory(
      [{ url: app, pid: 10 }, { url: host('a'), pid: 20 }, { url: host('b'), pid: 20 }, { url: host('c'), pid: 10 }],
      [{ pid: 10, workingSetKb: 1 }, { pid: 20, workingSetKb: 1 }],
      1,
    );
    expect(out).toEqual({});
  });

  it('ignores odd ids and frames that are not plugin sandboxes', () => {
    expect(pluginMemory([{ url: host('Bad_Id'), pid: 6 }, { url: 'about:blank', pid: 7 }], [{ pid: 6, workingSetKb: 1 }, { pid: 7, workingSetKb: 1 }], 1)).toEqual({});
  });
});

describe('the choice for the next start', () => {
  it('is remembered as a file in the data folder, and off by default', () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-diag-')), 'data');
    expect(isolationWanted(dir)).toBe(false);
    wantIsolation(dir, true);
    expect(fs.existsSync(path.join(dir, DIAGNOSTICS_FLAG))).toBe(true);
    expect(isolationWanted(dir)).toBe(true);
    wantIsolation(dir, false);
    expect(isolationWanted(dir)).toBe(false);
    // Turning it off again when it is not there is fine.
    wantIsolation(dir, false);
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  });
});
