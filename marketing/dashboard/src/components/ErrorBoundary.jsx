import { Component } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * Catches a render error in one page so the rest of the app (sidebar, tab bar, ⌘K) keeps working.
 * "Try again" remounts the page; "Reload" fetches the app again. `resetKey` clears the error on navigation.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Page crashed:", error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center" role="alert">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand/[0.1]">
          <AlertTriangle className="h-6 w-6 text-brand-ink" strokeWidth={2} />
        </div>
        <h2 className="text-title-2 font-bold text-ink">This page hit a problem</h2>
        <p className="mt-2 text-body text-ink-mute">Your data is safe. Try again, or reload the app if it keeps happening.</p>
        <p className="mt-2 max-w-full truncate text-[12px] text-ink-faint">{String(this.state.error?.message || this.state.error)}</p>
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={() => this.setState({ error: null })} className="h-9 rounded-xl px-3.5 text-callout font-semibold text-ink-soft shadow-[0_0_0_1px_var(--hairline-strong)] hover:bg-ink/[0.04]">
            Try again
          </button>
          <button type="button" onClick={() => window.location.reload()} className="inline-flex h-9 items-center gap-2 rounded-xl bg-gradient-to-b from-[#E30700] to-[#C20600] px-3.5 text-callout font-semibold text-white">
            <RotateCw className="h-4 w-4" /> Reload
          </button>
        </div>
      </div>
    );
  }
}
