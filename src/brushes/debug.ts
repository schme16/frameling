// ?debug only (round one: A to D, round two: P, the dropdown picker): swaps the saved-brush row for one of the layout mockups (brand/ab/brush-library), driven from a shot script:
//   __brushMock.set({ layout: 'A', n: 150, open: true })      __brushMock.off() puts the real row back
import { createElement } from 'react';
import { registerPanel } from '../core/registry';
import { store } from '../core/store';
import type { BrushSettings } from '../core/format';
import { LayoutP } from './mock/Picker';
import { BrushesPanelMock, LayoutA, LayoutBOptions, LayoutC, LayoutD } from './mock/Layouts';
import { libraryOf, mockState, setMock, type MockState } from './mock/state';
import { setMockRow } from './mockSlot';

const rows = { P: LayoutP, A: LayoutA, B: LayoutBOptions, C: LayoutC, D: LayoutD };

registerPanel({ id: 'brushes-mock', title: 'Brushes', icon: 'brush', component: BrushesPanelMock, zone: 'right', order: 15 });

(window as unknown as { __brushMock: unknown }).__brushMock = {
  set: (patch: Partial<MockState>) => {
    setMock(patch);
    // Choosing a brush this way also puts it in use, so the button does not show a change that was never made.
    if (patch.activeId) {
      const b = libraryOf(mockState().n).find((x) => x.id === patch.activeId);
      if (b) store().setUi((u) => ({ brush: { ...u.brush, ...b.brush } }));
    }
    setMockRow(() => createElement(rows[mockState().layout]));
  },
  /** Change the brush in use, as a slider would (so the "changed" marker shows). */
  tweak: (patch: Partial<BrushSettings>) => store().setUi((u) => ({ brush: { ...u.brush, ...patch } })),
  off: () => setMockRow(null),
};
