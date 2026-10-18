import { AlertCircle, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

interface ErrorStateProps { title?: string; description: string; onRetry?: () => void; action?: ReactNode }

export default function ErrorState({ title = 'Something went wrong', description, onRetry, action }: ErrorStateProps) {
  return <section role="alert" className="flex flex-col items-center rounded-2xl border border-rose-200 bg-rose-50/70 px-6 py-10 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-700"><AlertCircle size={21} aria-hidden="true" /></span><h2 className="mt-4 text-lg font-semibold text-slate-950">{title}</h2><p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">{description}</p>{onRetry && <button type="button" onClick={onRetry} className="btn-secondary mt-5 min-h-11"><RefreshCw size={16} aria-hidden="true" /> Try again</button>}{action && <div className="mt-5">{action}</div>}</section>;
}
