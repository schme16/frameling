// Asking for the discrete card on a computer with two: which environment is set for which machine, and the cases where
// nothing is set at all (the system picks, as it always did). Cards are plain objects, so every kind of machine is a case.
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cardAsk, hasDrawingDriver, isDiscrete, readCards, steering, type Card } from '../../src/main/gpuPick';

const nvidia: Card = { pci: '0000:01:00.0', vendorId: 0x10de, deviceId: 0x2702, driver: 'nvidia' };
const intelOnboard: Card = { pci: '0000:00:02.0', vendorId: 0x8086, deviceId: 0x4680, driver: 'i915' };
const amdOnboard: Card = { pci: '0000:16:00.0', vendorId: 0x1002, deviceId: 0x164e, driver: 'amdgpu', vramBytes: 512 * 1024 ** 2 };
const amdCard: Card = { pci: '0000:03:00.0', vendorId: 0x1002, deviceId: 0x744c, driver: 'amdgpu', vramBytes: 20 * 1024 ** 3 };
const haveNvidiaLib = (n: string) => n === 'libGLX_nvidia.so.0';
const noLibs = () => false;

describe('what counts as the discrete card', () => {
  it('NVIDIA always, AMD with real card memory, never Intel or an AMD onboard card', () => {
    expect(isDiscrete(nvidia)).toBe(true);
    expect(isDiscrete(amdCard)).toBe(true);
    expect(isDiscrete(amdOnboard)).toBe(false);
    expect(isDiscrete(intelOnboard)).toBe(false);
  });
  it('a card set aside for a virtual machine cannot draw', () => {
    expect(hasDrawingDriver({ ...amdOnboard, driver: 'vfio-pci' })).toBe(false);
    expect(hasDrawingDriver({ ...amdOnboard, driver: undefined })).toBe(false);
    expect(hasDrawingDriver(nvidia)).toBe(true);
  });
});

describe('steering to the discrete card', () => {
  it('a laptop (onboard Intel plus NVIDIA) asks for the NVIDIA card through its own switches', () => {
    const s = steering([intelOnboard, nvidia], {}, haveNvidiaLib);
    expect(s?.card).toBe(nvidia);
    expect(s?.env).toMatchObject({ __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia' });
  });
  it('a desktop with an AMD card and the onboard one asks for the AMD card by its PCI address', () => {
    expect(steering([amdOnboard, amdCard], {}, noLibs)?.env).toEqual({ DRI_PRIME: 'pci-0000_03_00_0' });
  });
  it('NVIDIA\'s open driver (nouveau) is a Mesa card and is asked for by address', () => {
    expect(steering([intelOnboard, { ...nvidia, driver: 'nouveau' }], {}, noLibs)?.env).toEqual({ DRI_PRIME: 'pci-0000_01_00_0' });
  });
  it('asks for nothing when there is only one card that works (the other is set aside for a virtual machine)', () => {
    const away = { ...amdOnboard, driver: 'vfio-pci' };
    expect(steering([away, nvidia], {}, haveNvidiaLib)).toBeNull();
  });
  it('asks for the card anyway when it is asked for by name, which is how a virtual screen gets it', () => {
    const away = { ...amdOnboard, driver: 'vfio-pci' };
    expect(steering([away, nvidia], { FRAMELING_CARD: 'discrete' }, haveNvidiaLib)?.card).toBe(nvidia);
  });
  it('leaves it to the system when told to, or when someone already chose', () => {
    expect(steering([intelOnboard, nvidia], { FRAMELING_CARD: 'system' }, haveNvidiaLib)).toBeNull();
    for (const k of ['DRI_PRIME', '__NV_PRIME_RENDER_OFFLOAD', '__GLX_VENDOR_LIBRARY_NAME', 'VK_ICD_FILENAMES']) expect(steering([intelOnboard, nvidia], { [k]: '1' }, haveNvidiaLib)).toBeNull();
  });
  it('does not force a driver whose library is not installed', () => expect(steering([intelOnboard, nvidia], {}, noLibs)).toBeNull());
  it('does not guess between two discrete cards, or when there is none', () => {
    expect(steering([nvidia, { ...nvidia, pci: '0000:02:00.0' }], {}, haveNvidiaLib)).toBeNull();
    expect(steering([intelOnboard, amdOnboard], {}, noLibs)).toBeNull();
    expect(steering([], {}, noLibs)).toBeNull();
  });
  it('reads the variable', () => {
    expect(cardAsk({})).toBe('auto');
    expect(cardAsk({ FRAMELING_CARD: ' Discrete ' })).toBe('discrete');
    expect(cardAsk({ FRAMELING_CARD: 'system' })).toBe('system');
    expect(cardAsk({ FRAMELING_CARD: 'banana' })).toBe('auto');
  });
});

describe('reading the cards from the system', () => {
  it('lists display cards with their driver and memory, and nothing else', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'frameling-pci-'));
    const add = (addr: string, cls: string, vendor: string, device: string, driver?: string, vram?: string) => {
      const d = path.join(root, addr);
      mkdirSync(d, { recursive: true });
      writeFileSync(path.join(d, 'class'), cls + '\n');
      writeFileSync(path.join(d, 'vendor'), vendor + '\n');
      writeFileSync(path.join(d, 'device'), device + '\n');
      if (driver) symlinkSync('/sys/bus/pci/drivers/' + driver, path.join(d, 'driver'));
      if (vram) writeFileSync(path.join(d, 'mem_info_vram_total'), vram + '\n');
    };
    add('0000:01:00.0', '0x030000', '0x10de', '0x2702', 'nvidia');
    add('0000:16:00.0', '0x030000', '0x1002', '0x164e', 'vfio-pci', '536870912');
    add('0000:00:1f.3', '0x040300', '0x8086', '0x51c8', 'snd_hda_intel');
    const cards = readCards(root);
    expect(cards).toEqual([
      { pci: '0000:01:00.0', vendorId: 0x10de, deviceId: 0x2702, driver: 'nvidia', vramBytes: undefined },
      { pci: '0000:16:00.0', vendorId: 0x1002, deviceId: 0x164e, driver: 'vfio-pci', vramBytes: 536870912 },
    ]);
  });
  it('gives an empty list, not a failure, when there is nothing to read', () => expect(readCards('/no/such/folder')).toEqual([]));
});
