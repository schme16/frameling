import { useEffect, useState } from 'react';
import { getQuest, questProgress } from './registry';
import { isCoveredByDialog, resolveTarget } from './target';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const PAD = 5;

/** The soft ring round whatever the current step points at. It never takes a click or the focus. */
export function Spotlight() {
  const p = questProgress.use((x) => x);
  const quest = p.active ? getQuest(p.active) : undefined;
  const step = quest?.steps[p.step];
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    const target = step?.target;
    if (!target) return setBox(null);
    const measure = () => {
      const el = resolveTarget(target);
      if (!el || isCoveredByDialog(el)) return setBox(null);
      const r = el.getBoundingClientRect();
      setBox((b) => (b && b.left === r.left && b.top === r.top && b.width === r.width && b.height === r.height ? b : { left: r.left, top: r.top, width: r.width, height: r.height }));
    };
    measure();
    const every = setInterval(measure, 250);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearInterval(every);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [quest?.id, step?.id]);

  if (!box) return null;
  // A big target (the whole canvas) gets a gentler, inset ring so it doesn't shout.
  const big = box.width > 360 && box.height > 240;
  return (
    <div
      className={`qs-ring${big ? ' qs-big' : ''}`}
      aria-hidden="true"
      style={{ left: box.left - PAD, top: box.top - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 }}
    />
  );
}
