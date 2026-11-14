// ?debug only: swaps the saved-brush row for one of the layout mockups (brand/ab/brush-library), driven from a shot script:
//   __brushMock.set({ layout: 'A', n: 150, open: true })      __brushMock.off() puts the real row back
import { createElement } from 'react';
import { registerPanel } from '../core/registry';
import { BrushesPanelMock, LayoutA, LayoutBOptions, LayoutC, LayoutD } from './mock/Layouts';
import { mockState, setMock, type MockState } from './mock/state';
import { setMockRow } from './mockSlot';

const rows = { A: LayoutA, B: LayoutBOptions, C: LayoutC, D: LayoutD };

registerPanel({ id: 'brushes-mock', title: 'Brushes', icon: 'brush', component: BrushesPanelMock, zone: 'right', order: 15 });

(window as unknown as { __brushMock: unknown }).__brushMock = {
  set: (patch: Partial<MockState>) => {
    setMock(patch);
    setMockRow(() => createElement(rows[mockState().layout]));
  },
  off: () => setMockRow(null),
};
