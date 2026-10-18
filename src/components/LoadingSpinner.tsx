import type { HTMLAttributes } from 'react';

interface LoadingSpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function LoadingSpinner({ label = 'Loading', size = 'md', className = '', ...props }: LoadingSpinnerProps) {
  const sizes = { sm: 'h-3.5 w-3.5 border-2', md: 'h-5 w-5 border-2', lg: 'h-7 w-7 border-[3px]' };
  return <span className={`inline-flex items-center gap-2 ${className}`} role="status" aria-live="polite" {...props}><span aria-hidden="true" className={`bfs-spinner shrink-0 rounded-full border-current border-r-transparent ${sizes[size]}`} /><span className="sr-only">{label}</span></span>;
}
