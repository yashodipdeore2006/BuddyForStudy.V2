import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import type { ReactNode } from 'react';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

export default function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Left side - branding */}
      <div className="relative hidden lg:flex lg:w-1/2 flex-col justify-between bg-gradient-to-br from-blue-600 to-blue-800 p-12">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-white">BuddyForStudy</span>
        </Link>

        <div className="space-y-6">
          <h2 className="text-3xl font-bold text-white">
            Learn. Build. Grow.
          </h2>
          <p className="text-lg text-blue-100">
            Your companion for structured learning. Discover courses, enroll, and track
            your progress as you master new skills.
          </p>
          <div className="space-y-3">
            {[
              'Structured curriculum with modules and lessons',
              'Hands-on tutorials and real-world projects',
              'Track your progress and resume anytime',
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3 text-blue-100">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
                  <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-blue-200">
          © 2026 BuddyForStudy. All rights reserved.
        </p>
      </div>

      {/* Right side - form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-slate-900">BuddyForStudy</span>
            </Link>
          </div>

          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">{subtitle}</p>

          <div className="mt-8">{children}</div>

          <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>
        </div>
      </div>
    </div>
  );
}
