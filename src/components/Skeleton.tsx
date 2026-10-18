import type { HTMLAttributes } from 'react';

type SkeletonProps = HTMLAttributes<HTMLDivElement> & { variant?: 'text' | 'circle' | 'rect' };

export function Skeleton({ variant = 'rect', className = '', ...props }: SkeletonProps) {
  const shape = variant === 'text' ? 'h-3 rounded-md' : variant === 'circle' ? 'rounded-full' : 'rounded-xl';
  return <div aria-hidden="true" className={`bfs-skeleton ${shape} ${className}`} {...props} />;
}

export function CourseCardSkeleton() {
  return <div aria-label="Loading course" className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-3"><Skeleton className="aspect-[16/9] w-full" /><div className="space-y-3 p-3"><Skeleton variant="text" className="h-3 w-1/3" /><Skeleton variant="text" className="h-5 w-4/5" /><Skeleton variant="text" className="h-4 w-full" /><Skeleton variant="text" className="h-4 w-2/3" /><div className="flex gap-2 pt-2"><Skeleton className="h-10 flex-1 rounded-full" /><Skeleton className="h-10 flex-1 rounded-full" /></div></div></div>;
}

export function CourseGridSkeleton({ count = 6 }: { count?: number }) {
  return <div aria-label="Loading courses" className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: count }, (_, index) => <CourseCardSkeleton key={index} />)}</div>;
}
