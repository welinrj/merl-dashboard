import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

/**
 * Contains render-time errors from the routed page so a single broken page
 * shows a friendly message instead of blanking the whole portal. Keyed by
 * route in App, so navigating to another section clears the error.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Surface the details for debugging; the UI stays graceful.
    console.error('Portal error boundary caught an error:', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{ padding: '3rem 1.5rem', display: 'flex', justifyContent: 'center' }}>
        <div
          className="card"
          style={{ maxWidth: 480, textAlign: 'center', borderTop: '3px solid var(--red-600)' }}
        >
          <div
            style={{
              width: 48, height: 48, borderRadius: '50%', margin: '0 auto 1rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--red-50)', color: 'var(--red-600)',
              fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-display)',
            }}
          >
            !
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--text-1)', margin: 0 }}>
            Something went wrong on this page
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', margin: '0.6rem 0 1rem' }}>
            An unexpected error occurred. You can open another section from the menu, or reload the page.
          </p>
          <div
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-3)',
              background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: 7,
              padding: '0.6rem 0.75rem', marginBottom: '1.25rem', wordBreak: 'break-word', textAlign: 'left',
            }}
          >
            {error.message || 'Unknown error'}
          </div>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
