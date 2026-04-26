import { Component } from 'react';
import { Link } from 'react-router-dom';

/**
 * ErrorBoundary — catches render-time errors anywhere in the subtree and
 * shows a clean recovery screen instead of a blank page.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // In production you'd send this to Sentry / Datadog / similar.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-hero-radial flex items-center justify-center p-6">
        <div className="mx-auto max-w-lg rounded-[32px] border border-ink/10 bg-white/80 p-10 text-center shadow-bloom space-y-6">
          <div className="mx-auto h-14 w-14 rounded-full bg-ember/10 flex items-center justify-center">
            <svg className="h-7 w-7 text-ember" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-ember">Something went wrong</p>
            <h1 className="font-display text-3xl text-ink">Unexpected error</h1>
            <p className="text-sm text-ink/60 max-w-xs mx-auto">
              A rendering error occurred. You can try refreshing the page, or go back to the home screen.
            </p>
          </div>

          {import.meta.env.DEV && this.state.error && (
            <details className="text-left rounded-2xl bg-sand px-4 py-3">
              <summary className="cursor-pointer text-xs text-ink/50 font-medium">
                Error details (dev only)
              </summary>
              <pre className="mt-2 text-xs text-ember overflow-auto whitespace-pre-wrap">
                {this.state.error.toString()}
              </pre>
            </details>
          )}

          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full border border-ink/10 bg-sand px-5 py-2.5 text-sm font-semibold text-ink hover:bg-white transition"
            >
              Refresh page
            </button>
            <Link
              to="/"
              onClick={this.handleReset}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-sand hover:bg-dusk transition"
            >
              Go home
            </Link>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;