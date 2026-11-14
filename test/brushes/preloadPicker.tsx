// The brush picker's panel is its own download (BrushPickerPanel.tsx), fetched when the picker first opens. React
// keeps a lazy part once it has arrived, so a test opens the picker one time here, and then every test after it finds
// the panel on the first render like it did when the panel was part of the picker.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { BrushPicker } from '../../src/brushes/BrushPicker';
import { resetStore, store } from '../../src/core/store';
import { newDoc } from '../../src/core/doc';

export async function preloadPicker(): Promise<void> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  resetStore(newDoc());
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<BrushPicker />));
  await act(async () => host.querySelector<HTMLButtonElement>('.pk-btn')!.click());
  await act(async () => void (await new Promise((r) => setTimeout(r, 20))));
  if (!document.querySelector('.pk-pop')) throw new Error('The brush picker panel did not load.');
  await act(async () => root.unmount());
  host.remove();
  store().setUi({});
}
