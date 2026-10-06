import { Link } from 'react-router-dom';
import { Bell, BookOpen, TrendingUp, Award, Info } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import { useAuth } from '@/context/AuthContext';

const mockNotifications = [
  {
    id: 1,
    icon: BookOpen,
    title: 'New course available',
    message: 'A new course "MERN Stack Development" has been published.',
    time: '2 hours ago',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    id: 2,
    icon: TrendingUp,
    title: 'Progress milestone reached',
    message: 'You\'ve completed 50% of your enrolled course. Keep it up!',
    time: '1 day ago',
    color: 'bg-green-50 text-green-600',
  },
  {
    id: 3,
    icon: Award,
    title: 'Lesson completed',
    message: 'You successfully completed "Introduction to React".',
    time: '3 days ago',
    color: 'bg-amber-50 text-amber-600',
  },
];

export default function Notifications() {
  const { profile } = useAuth();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
      <p className="mt-1 text-sm text-slate-500">
        Stay updated on your learning activity
      </p>

      <div className="mt-6">
        {mockNotifications.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Bell className="h-8 w-8" />}
              title="No notifications yet"
              description="You'll see updates about your courses, projects, and platform announcements here."
              action={
                <Link to="/courses" className="btn-primary">
                  Browse Courses
                </Link>
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {mockNotifications.map((notif) => (
              <div key={notif.id} className="card flex items-start gap-4 p-4 hover:shadow-md transition-shadow">
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${notif.color}`}>
                  <notif.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{notif.title}</h3>
                    <span className="text-xs text-slate-400 flex-shrink-0">{notif.time}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{notif.message}</p>
                </div>
              </div>
            ))}

            <div className="card flex items-start gap-4 p-4 border-dashed border-2">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                <Info className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">
                  Notifications are scoped to your account and cannot be accessed by other users.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
