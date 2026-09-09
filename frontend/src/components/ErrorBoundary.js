import { Component } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Catches render/lifecycle errors anywhere below it and shows a recoverable
 * fallback instead of a blank window. API rejections are handled at the call
 * sites and by the global handler in index.js. This is for the rare render bug.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[grabbr] render error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="h-screen flex items-center justify-center bg-background p-8">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-lg font-semibold tracking-tight">Something broke on this screen</h1>
          <p className="text-sm text-muted-foreground font-mono break-words">
            {String(this.state.error?.message || this.state.error)}
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => this.setState({ error: null })}>Try again</Button>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </div>
        </div>
      </div>
    );
  }
}
