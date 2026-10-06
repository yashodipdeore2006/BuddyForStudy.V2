import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { Course } from '@/types';
import CourseCard from '@/components/CourseCard';
import {
  GraduationCap,
  BookOpen,
  Trophy,
  ArrowRight,
  Code2,
  Database,
  Layers,
  Sparkles,
} from 'lucide-react';
import EmptyState from '@/components/EmptyState';

export default function Home() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCourses() {
      try {
        const data = await apiFetch('/api/courses?limit=6');
        const mappedCourses = (data.courses || []).map((course: any) => ({
          ...course,
          id: String(course._id || course.id),
          learning_outcomes: course.learningOutcomes || course.learning_outcomes || [],
          is_published: course.isPublished ?? course.is_published ?? false,
          created_at: course.createdAt || course.created_at,
          updated_at: course.updatedAt || course.updated_at,
          created_by: course.createdBy || course.created_by || null,
        }));
        setCourses(mappedCourses as Course[]);
      } catch {
        setCourses([]);
      } finally {
        setLoading(false);
      }
    }
    fetchCourses();
  }, []);

  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAzNGgtMnYtNGgydjR6bTAtNmgtMnYtNGgydjR6bS02IDZoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0eiIgZmlsbD0iI2ZmZiIgZmlsbC1vcGFjaXR5PSIuMDUiLz48L2c+PC9zdmc+')] opacity-30" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge bg-white/10 text-blue-100 backdrop-blur-sm">
              <Sparkles className="h-3 w-3" /> Your learning companion
            </span>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Learn. Build. Grow.
            </h1>
            <p className="mt-6 text-lg text-blue-100 sm:text-xl">
              Discover structured courses, follow guided tutorials, build real projects,
              and track your progress — all in one place.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                to="/courses"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-base font-semibold text-blue-700 shadow-lg transition-all hover:bg-blue-50"
              >
                Explore Courses
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-6 py-3 text-base font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10"
              >
                Get Started Free
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
            {[
              { icon: BookOpen, label: 'Courses', value: 'Growing library' },
              { icon: Layers, label: 'Structured', value: 'Modules & lessons' },
              { icon: Code2, label: 'Hands-on', value: 'Real projects' },
              { icon: Trophy, label: 'Track', value: 'Your progress' },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                  <stat.icon className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{stat.value}</p>
                  <p className="text-xs text-slate-500">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900">How It Works</h2>
            <p className="mt-2 text-slate-500">Four simple steps to start learning</p>
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: 1,
                icon: BookOpen,
                title: 'Discover',
                description: 'Browse the course catalog and find what interests you.',
              },
              {
                step: 2,
                icon: GraduationCap,
                title: 'Enroll',
                description: 'Enroll in any published course with a single click.',
              },
              {
                step: 3,
                icon: Layers,
                title: 'Learn',
                description: 'Follow tutorials and build projects through guided lessons.',
              },
              {
                step: 4,
                icon: Trophy,
                title: 'Track Progress',
                description: 'Mark lessons complete and watch your progress grow.',
              },
            ].map((item) => (
              <div key={item.step} className="card p-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
                  <item.icon className="h-6 w-6 text-white" />
                </div>
                <div className="mt-4 text-xs font-bold text-blue-600">STEP {item.step}</div>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-500">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Courses */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-slate-900">Featured Courses</h2>
              <p className="mt-2 text-slate-500">Start with our most popular courses</p>
            </div>
            <Link
              to="/courses"
              className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              View all
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
              </div>
            ) : courses.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="h-8 w-8" />}
                title="No courses available yet"
                description="Check back soon — new courses are being added regularly."
              />
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {courses.map((course) => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
            )}
          </div>

          <div className="mt-10 text-center sm:hidden">
            <Link to="/courses" className="btn-primary">
              View All Courses
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white">Ready to start learning?</h2>
          <p className="mt-4 text-lg text-blue-100">
            Create a free account and enroll in your first course today.
          </p>
          <Link
            to="/register"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-base font-semibold text-blue-700 shadow-lg transition-all hover:bg-blue-50"
          >
            Get Started Free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
