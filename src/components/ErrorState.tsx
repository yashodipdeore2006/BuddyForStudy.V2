import { AlertCircle, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

interface ErrorStateProps {
  title?: string;
  description: string;
  onRetry?: () => void;
  action?: ReactNode;
}

export default function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  action,
}: ErrorStateProps) {
  return (
    <section role="alert" className="bfs-error-state">
      <span className="bfs-error-state__icon"><AlertCircle size={21} aria-hidden="true" /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="bfs-error-state__retry">
          <RefreshCw size={16} aria-hidden="true" /> Retry
        </button>
      )}
      {action && <div className="bfs-error-state__action">{action}</div>}
    </section>
  );
}
