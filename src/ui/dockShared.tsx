// Bits the tab zones and the right side's rail share.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from './icons';
import { createStore } from './mini';

/** The panel being dragged, if any. */
export const dragging = createStore<string | null>(null);

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
