// Bits the tab zones and the right side's rail share.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from './icons';
import { createStore } from './mini';

/** The panel being dragged, if any. */
export const dragging = createStore<string | null>(null);

/** The panel the person last pressed in or tabbed into, so "move this panel" commands know which one. */
export const lastPanel = createStore<string | null>(null);

/** Follows where the person works. Panel bodies, tabs, rail items and Properties sections carry `data-panel-id`. */
export function installPanelFocus(): () => void {
  const note = (e: Event) => {
    const el = e.target instanceof Element ? e.target.closest('[data-panel-id]') : null;
    const id = el?.getAttribute('data-panel-id');
    if (id) lastPanel.set(id);
  };
  document.addEventListener('pointerdown', note, true);
  document.addEventListener('focusin', note, true);
  return () => {
    document.removeEventListener('pointerdown', note, true);
    document.removeEventListener('focusin', note, true);
  };
}

/** One broken panel shouldn't take the window with it. */
export class PanelBoundary extends Component<{ children: ReactNode; name: string }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  componentDidCatch(e: unknown, info: ErrorInfo) {
    console.error(`Panel "${this.props.name}" crashed`, e, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="ui-panel-broken">
        <Icon name="warning" size={20} />
        <p>The {this.props.name} panel tripped over something.</p>
        <button type="button" className="ui-btn" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
