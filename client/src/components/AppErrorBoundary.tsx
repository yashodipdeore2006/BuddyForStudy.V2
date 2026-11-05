import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: ReactNode }
interface State { hasError: boolean; errorId: string }

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorId: '' };

  static getDerivedStateFromError(): State {
    return { hasError: true, errorId: `BFS-${Date.now().toString(36).toUpperCase()}` };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep diagnostics in developer tools; never expose stack traces to learners.
    console.error('[BuddyForStudy UI error]', { message: error.message, componentStack: info.componentStack });
  }

  private recover = () => {
    this.setState({ hasError: false, errorId: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-slate-50 px-5 py-12">
        <section role="alert" className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><AlertTriangle size={26} aria-hidden="true" /></span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">This page ran into a problem</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">Your data has not necessarily been lost. Try loading the page again. If the problem continues, share the reference code with support.</p>
          <p className="mt-4 text-xs text-slate-500">Reference: <code>{this.state.errorId}</code></p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={this.recover} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"><RefreshCw size={16} aria-hidden="true" /> Try again</button>
            <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Reload page</button>
          </div>
        </section>
      </main>
    );
  }
}
