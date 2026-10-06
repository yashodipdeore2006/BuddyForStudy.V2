import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-slate-900">BuddyForStudy</span>
          </div>
          <p className="text-sm text-slate-500">
            Learn. Build. Grow. — Your companion for structured learning.
          </p>
          <div className="flex gap-6 text-sm text-slate-500">
            <Link to="/courses" className="hover:text-slate-900">
              Courses
            </Link>
            <Link to="/login" className="hover:text-slate-900">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
