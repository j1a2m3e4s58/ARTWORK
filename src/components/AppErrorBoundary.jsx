import { Component } from 'react';

export default class AppErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error, details) {
    console.error('Application rendering error', error, details);
  }
  render() {
    if (this.state.failed) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-obsidian px-6 text-center text-ivory">
          <div className="max-w-md">
            <img src="/brand/reigns-app-icon-192.png" alt="" className="mx-auto h-20 w-20 rounded-full" />
            <h1 className="mt-6 font-display text-3xl">The studio needs a moment</h1>
            <p className="mt-3 text-sm text-ivory/45">Refresh the page to continue. Your submitted records remain safely stored.</p>
            <button onClick={() => window.location.reload()} className="mt-6 bg-brass px-5 py-3 text-sm text-obsidian">Refresh page</button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
