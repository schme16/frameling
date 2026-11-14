// The docked zones (left, right, bottom, top): tabs you can drag, splitters you can pull, zones that fold away.
import { type DockZone } from '../core/registry';
import { clampSize, DEFAULT_SIZE, dock, MAX_SIZE, MIN_SIZE, panelsAway, resizeZone } from './dock';
import { TabGroupView, ZoneStack } from './DockGroup';
import { useEdgeDrag } from './dockShared';
import { RightDock } from './RightDock';
import { rightStyle } from './rightStyle';

export function DockZoneView({ zone }: { zone: DockZone }) {
  const style = rightStyle.use((v) => v);
  const away = panelsAway.use((v) => v);
  if (away) return null;
  if (zone === 'right' && style !== 'tabs') return <RightDock zone={zone} style={style} />;
  return <TabZoneView zone={zone} panelsButton={zone === 'right'} />;
}

function TabZoneView({ zone, panelsButton }: { zone: DockZone; panelsButton?: boolean }) {
  const z = dock.use((d) => d.layout.zones[zone]);
  // An empty zone takes no room. While something is dragged, the bands over the canvas edges stand in for it.
  if (!z.tabs.length) return null;
  const horizontal = zone === 'bottom' || zone === 'top';
  const style = z.collapsed ? undefined : horizontal ? { height: z.size } : { width: z.size };
  return (
    <section className={`ui-zone ui-zone-${zone}${z.collapsed ? ' is-collapsed' : ''}`} style={style} aria-label={`${zone} panels`}>
      <ZoneStack zone={zone} render={(gi) => <TabGroupView zone={zone} group={gi} panelsButton={panelsButton && gi === 0} />} />
    </section>
  );
}

/** The thin line between a zone and the canvas. */
export function Splitter({ zone }: { zone: DockZone }) {
  const z = dock.use((d) => d.layout.zones[zone]);
  const away = panelsAway.use((v) => v);
  const horizontal = zone === 'bottom' || zone === 'top';
  // Dragging right grows the left side, left grows the right side; down grows the top, up grows the bottom.
  const sign = zone === 'left' || zone === 'top' ? 1 : -1;
  const drag = useEdgeDrag({ horizontal, sign, size: () => z.size, set: (n) => resizeZone(zone, clampSize(zone, n)) });
  if (!z.tabs.length || z.collapsed || away) return null;

  return (
    <div
      className={`ui-splitter ui-splitter-${horizontal ? 'h' : 'v'}`}
      role="separator"
      aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-label={`Resize the ${zone} panels`}
      aria-valuenow={z.size}
      aria-valuemin={MIN_SIZE[zone]}
      aria-valuemax={MAX_SIZE[zone]}
      aria-valuetext={`${z.size} pixels`}
      tabIndex={0}
      data-help="panels"
      {...drag}
      onDoubleClick={() => resizeZone(zone, DEFAULT_SIZE[zone])}
      onKeyDown={(e) => {
        // Arrows resize (Shift for bigger steps), Home and End go to the smallest and largest, Enter resets.
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const grow = zone === 'top' ? 'ArrowDown' : horizontal ? 'ArrowUp' : zone === 'left' ? 'ArrowRight' : 'ArrowLeft';
        const shrink = zone === 'top' ? 'ArrowUp' : horizontal ? 'ArrowDown' : zone === 'left' ? 'ArrowLeft' : 'ArrowRight';
        const step = e.shiftKey ? 64 : 16;
        let next: number | null = null;
        if (e.key === grow) next = z.size + step;
        else if (e.key === shrink) next = z.size - step;
        else if (e.key === 'Home') next = MIN_SIZE[zone];
        else if (e.key === 'End') next = MAX_SIZE[zone];
        else if (e.key === 'Enter') next = DEFAULT_SIZE[zone];
        if (next === null) return;
        e.preventDefault();
        resizeZone(zone, clampSize(zone, next));
      }}
    />
  );
}
