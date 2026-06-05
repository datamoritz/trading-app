import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';

interface BoundaryState {
  error: Error | null;
  info: ErrorInfo | null;
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) return error.stack || error.message;
  return String(error);
}

function ErrorPanel({
  title,
  details,
  onDismiss,
}: {
  title: string;
  details: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 max-h-[45vh] overflow-auto rounded border border-red-500/70 bg-[#1b1113] p-3 text-left shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-red-200">{title}</div>
          <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-red-100/90">
            {details}
          </pre>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded border border-red-400/40 px-2 py-1 text-xs text-red-100 hover:border-red-300"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null, info: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React render crash', error, info);
    this.setState({ error, info });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const details = [
      this.state.error.stack || this.state.error.message,
      this.state.info?.componentStack ? `Component stack:\n${this.state.info.componentStack}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    return (
      <div className="h-screen w-screen bg-surface text-gray-200">
        <ErrorPanel title="The app crashed while rendering" details={details} />
      </div>
    );
  }
}

export function RuntimeErrorOverlay() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      setMessage(formatUnknownError(event.error || event.message));
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      setMessage(formatUnknownError(event.reason));
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  if (!message) return null;
  return <ErrorPanel title="Runtime error" details={message} onDismiss={() => setMessage(null)} />;
}
