// The processor and memory words: what each platform's raw answer turns into.
import { describe, expect, it } from 'vitest';
import { archText, cpuText, parseCpuinfo, readCpu, tidyModel } from '../../src/gpu/cpu';

/** Two logical processors on one core, as Linux lists a computer that runs two threads on each core. */
const ryzen = (threads: number, cores: number) =>
  Array.from({ length: threads }, (_, i) => `processor\t: ${i}\nvendor_id\t: AuthenticAMD\nmodel name\t: AMD Ryzen 7 5800X 8-Core Processor\nphysical id\t: 0\ncore id\t\t: ${i % cores}\ncpu cores\t: ${cores}\n`).join('\n');

describe('the processor name', () => {
  it('drops the trademark marks and doubled spaces', () => {
    expect(tidyModel('Intel(R) Core(TM) i7-9700K CPU @ 3.60GHz')).toBe('Intel Core i7-9700K CPU @ 3.60GHz');
    expect(tidyModel('  AMD   Ryzen  ')).toBe('AMD Ryzen');
  });
});

describe('Linux /proc/cpuinfo', () => {
  it('counts real cores, not threads', () => {
    expect(parseCpuinfo(ryzen(16, 8))).toEqual({ model: 'AMD Ryzen 7 5800X 8-Core Processor', cores: 8 });
  });
  it('counts cores across two sockets', () => {
    const two = 'model name : Xeon\nphysical id : 0\ncore id : 0\ncpu cores : 1\n\nmodel name : Xeon\nphysical id : 1\ncore id : 0\ncpu cores : 1\n';
    expect(parseCpuinfo(two).cores).toBe(2);
  });
  it('reads an ARM board that names its Hardware and says no core ids', () => {
    expect(parseCpuinfo('processor : 0\nBogoMIPS : 108.00\n\nprocessor : 1\n\nHardware : BCM2711\nModel : Raspberry Pi 4 Model B Rev 1.4\n')).toEqual({ model: 'BCM2711', cores: undefined });
  });
  it('gives nothing for text it cannot read', () => {
    expect(parseCpuinfo('')).toEqual({ model: undefined, cores: undefined });
  });
});

describe('readCpu', () => {
  const cpus16 = Array.from({ length: 16 }, () => ({ model: 'AMD Ryzen 7 5800X 8-Core Processor' }));
  it('Linux: the model and real cores from /proc/cpuinfo, threads from the engine', () => {
    expect(readCpu({ cpus: cpus16, arch: 'x64', cpuinfo: ryzen(16, 8) })).toEqual({ model: 'AMD Ryzen 7 5800X 8-Core Processor', cores: 8, threads: 16, arch: 'x64' });
  });
  it('macOS and Windows: the engine gives the model and the thread count, and no cores are claimed', () => {
    expect(readCpu({ cpus: [{ model: 'Apple M2' }, { model: 'Apple M2' }], arch: 'arm64', cpuinfo: null })).toEqual({ model: 'Apple M2', threads: 2, arch: 'arm64' });
  });
  it('a core count bigger than the threads is thrown away as wrong', () => {
    expect(readCpu({ cpus: [{ model: 'x' }], arch: 'x64', cpuinfo: ryzen(16, 8) }).cores).toBeUndefined();
  });
  it('a system that says nothing is said plainly', () => {
    expect(readCpu({ cpus: [], arch: 'x64', cpuinfo: null }).model).toBe('not reported');
  });
});

describe('the words', () => {
  it('names the architecture plainly with the short name second', () => {
    expect(archText('x64')).toBe('64-bit Intel or AMD (x64)');
    expect(archText('arm64')).toContain('(arm64)');
    expect(archText('riscv64')).toBe('riscv64');
  });
  it('says cores and threads, and singular for one', () => {
    expect(cpuText({ model: 'AMD Ryzen 7', cores: 8, threads: 16, arch: 'x64' })).toBe('AMD Ryzen 7, 8 cores, 16 threads');
    expect(cpuText({ model: 'Apple M2', threads: 1, arch: 'arm64' })).toBe('Apple M2, 1 thread');
    expect(cpuText(undefined)).toBe('not reported');
  });
});
