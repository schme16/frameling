// Which card is really drawing, and what it is called. The shapes here are real ones: the strings are what this build
// machine's engine says (an RTX 4080 SUPER beside an onboard AMD card that a virtual machine has set aside).
import { describe, expect, it } from 'vitest';
import { activeIndex, bestName, isGenericName, parseRenderer, pciIdsName } from '../../src/gpu/identify';

const VULKAN_NV = 'ANGLE (NVIDIA, Vulkan 1.4.351 (NVIDIA NVIDIA GeForce RTX 4080 SUPER (0x00002702)), NVIDIA)';
const GL_NV = 'ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 4080 SUPER/PCIe/SSE2, OpenGL 4.5.0)';
const GL_AMD = 'ANGLE (AMD, AMD Radeon Graphics (radeonsi, raphael_mendocino, LLVM 20.1.2, DRM 3.64, 6.17.0), OpenGL 4.6 (Core Profile) Mesa 25.2)';
const LLVMPIPE = 'ANGLE (Mesa, llvmpipe (LLVM 20.1.2 256 bits), OpenGL 4.5)';

describe('reading a renderer string', () => {
  it('names the card on Vulkan, without the doubled maker or the device id, and keeps the id', () => {
    expect(parseRenderer(VULKAN_NV)).toMatchObject({ name: 'NVIDIA GeForce RTX 4080 SUPER', api: 'Vulkan', deviceId: 0x2702, soft: false });
  });
  it('names the card on OpenGL, without the /PCIe/SSE2 tail', () => {
    expect(parseRenderer(GL_NV)).toMatchObject({ name: 'NVIDIA GeForce RTX 4080 SUPER', api: 'OpenGL' });
  });
  it('names a Mesa card without its driver details', () => {
    expect(parseRenderer(GL_AMD)).toMatchObject({ name: 'AMD Radeon Graphics', api: 'OpenGL' });
  });
  it('reads Windows and Mac renderers', () => {
    expect(parseRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toMatchObject({ name: 'NVIDIA GeForce RTX 3060', api: 'Direct3D' });
    expect(parseRenderer('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)')).toMatchObject({ name: 'Apple M2', api: 'Metal' });
  });
  it('says software, with no name, for llvmpipe and SwiftShader', () => {
    expect(parseRenderer(LLVMPIPE)).toMatchObject({ name: null, api: 'Software', soft: true });
    expect(parseRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)').soft).toBe(true);
  });
  it('says nothing for an empty renderer', () => expect(parseRenderer('')).toMatchObject({ name: null, soft: false }));
});

describe('a name that is only a code', () => {
  it('is generic', () => {
    for (const s of ['NVIDIA Device (0x2702)', 'NVIDIA Device 2702', 'AMD Device (164e)', 'Device 0x2702', '0x2702', '', undefined]) expect(isGenericName(s)).toBe(true);
  });
  it('is not a real name', () => {
    for (const s of ['NVIDIA GeForce RTX 4080 SUPER', 'AMD Radeon Graphics', 'Intel(R) UHD Graphics 770']) expect(isGenericName(s)).toBe(false);
  });
});

describe('which card is drawing', () => {
  // The engine's own list on this machine: the onboard AMD card marked active, the NVIDIA one not.
  const two = [
    { vendorId: 0x1002, deviceId: 0x164e, active: true },
    { vendorId: 0x10de, deviceId: 0x2702, active: false },
  ];
  it('is the discrete card when the page says so, whatever the engine flagged (Vulkan names the device id)', () => expect(activeIndex(two, VULKAN_NV)).toBe(1));
  it('is the discrete card on OpenGL too (the vendor decides)', () => expect(activeIndex(two, GL_NV)).toBe(1));
  it('is the onboard card when that is what the page says', () => expect(activeIndex(two, GL_AMD)).toBe(0));
  it('is no card at all when the page is on software', () => expect(activeIndex(two, LLVMPIPE)).toBe(-1));
  it('falls back to the engine when there is no renderer', () => {
    expect(activeIndex(two, undefined)).toBe(0);
    expect(activeIndex(two, '')).toBe(0);
  });
  it('keeps the engine pick between two cards of one maker when the renderer cannot tell them apart', () => {
    const amds = [
      { vendorId: 0x1002, deviceId: 0x164e, active: false },
      { vendorId: 0x1002, deviceId: 0x744c, active: true },
    ];
    expect(activeIndex(amds, GL_AMD)).toBe(1);
  });
});

describe('the name of a card', () => {
  it('uses the page when the card is the one drawing', () => expect(bestName({ isActive: true, renderer: VULKAN_NV, pciName: 'NVIDIA AD103' })).toBe('NVIDIA GeForce RTX 4080 SUPER'));
  it('never lets a generic engine string beat a real name', () => {
    expect(bestName({ isActive: false, deviceString: 'NVIDIA Device (0x2702)', pciName: 'NVIDIA GeForce RTX 4080 SUPER' })).toBe('NVIDIA GeForce RTX 4080 SUPER');
    expect(bestName({ isActive: true, deviceString: 'NVIDIA Device (0x2702)', glRenderer: GL_NV })).toBe('NVIDIA GeForce RTX 4080 SUPER');
  });
  it('uses a real engine string', () => expect(bestName({ isActive: false, deviceString: 'NVIDIA GeForce RTX 4080 SUPER' })).toBe('NVIDIA GeForce RTX 4080 SUPER'));
  it('gives nothing, not a code, when nothing names it', () => expect(bestName({ isActive: false })).toBeUndefined());
});

const PCI = `# list
1002  Advanced Micro Devices, Inc. [AMD/ATI]
\t164e  Raphael
\t744c  Navi 31 [Radeon RX 7900 XT/7900 XTX/7900M]
10de  NVIDIA Corporation
\t2684  AD102 [GeForce RTX 4090]
\t2702  AD103 [GeForce RTX 4080 SUPER]
\t\t10de 1234  Some subsystem
8086  Intel Corporation
\t4680  AlderLake-S GT1 [UHD Graphics 770]
`;
describe('the system\'s PCI list', () => {
  it('gives the marketing name in the brackets, with the maker in front', () => {
    expect(pciIdsName(PCI, 0x10de, 0x2702)).toBe('NVIDIA GeForce RTX 4080 SUPER');
    expect(pciIdsName(PCI, 0x8086, 0x4680)).toBe('Intel UHD Graphics 770');
  });
  it('uses the plain name when there are no brackets', () => expect(pciIdsName(PCI, 0x1002, 0x164e)).toBe('AMD Raphael'));
  it('does not look into the next maker, and says null for an unknown card', () => {
    expect(pciIdsName(PCI, 0x1002, 0x2702)).toBeNull();
    expect(pciIdsName(PCI, 0x10de, 0x9999)).toBeNull();
    expect(pciIdsName(PCI, 0x1234, 0x1)).toBeNull();
  });
});
