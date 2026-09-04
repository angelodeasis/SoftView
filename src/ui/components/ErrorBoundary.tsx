import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Renders the fallback UI; call the given function to try rendering children again. */
  fallback: (reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches rendering errors in its subtree so a bug in one part of the UI (a bad event
 * shape, an unanticipated edge case) doesn't blank the whole page. React only supports
 * this via a class component — there is no hook equivalent.
 *
 * Logs to the console only — SoftView never sends anything off the device, error
 * reports included.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown): void {
    console.error('SoftView: caught a rendering error', error);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback(this.reset);
    }
    return this.props.children;
  }
}
