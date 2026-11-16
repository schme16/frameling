// The Turn into section of Properties: one button for the kind of layer you are on.
import { useStore } from '../core/store';
import { ActionButton, Tip } from '../canvas/controls';
import { Section } from '../symbols/Num';
import { openConvert } from './open';
import { wayFor } from './relevant';
import '../symbols/symbols.css';

export function ConvertPanel() {
  const way = useStore((s) => wayFor(s));
  return (
    <div className="cv-options sy-props" data-help={way === 'shapes' ? 'convert-to-shapes' : 'convert-to-pixels'}>
      <Section title="Turn into">
        {way === 'pixels' && (
          <>
            <Tip>Turns the shapes you picked, or this whole drawing, into pixels. You can paint them afterwards, but you can no longer reshape them. You see it first, and one undo takes it back.</Tip>
            <ActionButton onClick={() => openConvert('pixels')} title="Turn these shapes into a grid of pixels (rasterize)">
              Turn into pixels (rasterize)
            </ActionButton>
          </>
        )}
        {way === 'shapes' && (
          <>
            <Tip>Turns the pixels you selected, or this whole drawing, into flat-colour shapes you can reshape. Flat colours work best: a photo makes a mess. You see it first, and one undo takes it back.</Tip>
            <ActionButton onClick={() => openConvert('shapes')} title="Trace these pixels into shapes (vectorize)">
              Turn into shapes (trace)
            </ActionButton>
          </>
        )}
        {!way && <Tip stays>Pick a layer of shapes or a pixel layer with something on it.</Tip>}
      </Section>
    </div>
  );
}
