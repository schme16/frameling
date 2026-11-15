import { describe, expect, it } from 'vitest';
import { findRawDisplays } from './scan';

const flag = (code: string) => findRawDisplays('x.tsx', code).length;

describe('the stream-safe scanner itself', () => {
  it('flags a raw path in text, a tooltip and a label', () => {
    expect(flag('const A = () => <span>{file.path}</span>;')).toBe(1);
    expect(flag('const A = () => <button data-tip={r.path}>x</button>;')).toBe(1);
    expect(flag('const A = () => <button aria-label={`Open ${f.filePath}`}>x</button>;')).toBe(1);
    expect(flag('const A = () => <small title={describePlace(f.path, dirName)}>x</small>;')).toBeGreaterThan(0);
  });
  it('flags a raw author name, contact or token', () => {
    expect(flag('const A = () => <p>By {t.author}</p>;')).toBe(1);
    expect(flag('const A = () => <b>{contact}</b>;')).toBe(1);
    expect(flag('const A = () => <code>{apiKey}</code>;')).toBe(1);
  });
  it('flags one inside a list row', () => {
    expect(flag('const A = () => <ul>{files.map((f) => <li key={f.path}><b>{baseName(f.path)}</b></li>)}</ul>;')).toBe(1);
  });
  it('passes what goes through the helper', () => {
    expect(flag('const A = () => <span>{displayPath(file.path)}</span>;')).toBe(0);
    expect(flag('const A = () => <p>By {displayName(t.author)}</p>;')).toBe(0);
    expect(flag('const A = () => <small title={scrubText(f.path)}>x</small>;')).toBe(0);
    expect(flag('const A = () => <b>{displaySecret(contact)}</b>;')).toBe(0);
  });
  it('passes code that is not shown', () => {
    expect(flag('const A = () => <button key={f.path} onClick={() => openPath(f.path)} data-testid={`r.${f.path}`}>x</button>;')).toBe(0);
  });
  it('lets a reason through', () => {
    expect(flag("const A = () => <p>By {m.author /* stream-safe-ok: a plugin maker's name, not yours */}</p>;")).toBe(0);
  });
});

import { findRawMessages } from './scan';
describe('the scanner on toasts', () => {
  const msg = (code: string) => findRawMessages('x.ts', code).length;
  it('flags a path or file name in a toast', () => {
    expect(msg('notify(`Saved ${baseName(path)}`, "success");')).toBe(1);
    expect(msg('toast(`Opened ${r.path}`);')).toBe(1);
    expect(msg('notifySaved(`Exported ${baseName(shown)}`, "success");')).toBe(1);
  });
  it('passes the helper, and plain words', () => {
    expect(msg('notify(`Saved ${displayPath(path)}`, "success");')).toBe(0);
    expect(msg('toast("Frame 3 of 10");')).toBe(0);
    expect(msg('notify("Nothing to do", "info", { run: () => open(r.path) });')).toBe(0);
  });
});

describe('the scanner knows asking from showing', () => {
  it('lets a yes-or-no or a count through, not the thing itself', () => {
    expect(flag('const A = () => <>{contact && <b>saved</b>}{!!r.path && <i/>}{f.paths.length}{r.path ? <b>a</b> : <b>b</b>}</>;')).toBe(0);
    expect(flag('const A = () => <b>{name || r.path}</b>;')).toBe(1);
    expect(flag('const A = () => <b>{ok ? r.path : "none"}</b>;')).toBe(1);
  });
});
