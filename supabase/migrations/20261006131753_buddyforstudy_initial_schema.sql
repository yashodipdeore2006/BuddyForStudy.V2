/*
# BuddyForStudy - Initial Database Schema

## Overview
Creates the complete database schema for the BuddyForStudy learning platform MVP.
Supports the student journey: Discover -> Enroll -> Learn -> Build Projects -> Track Progress
And the admin journey: Manage Users -> Manage Courses -> Manage Curriculum -> Publish -> Monitor

## New Tables
1. profiles - Extends auth.users with display name, role (user/admin), and active status
2. courses - Course catalog with embedded modules and lessons stored as JSONB
3. enrollments - Student-course enrollment relationships with status tracking
4. progress - Student learning progress per course with completed lesson tracking

## Security (RLS)
- profiles: users read/update own profile; admins read all and manage status/role
- courses: published courses readable by everyone; admin-only for CRUD
- enrollments: owner-scoped CRUD; admin can read all
- progress: owner-scoped CRUD; admin can read all
- is_admin() helper function for admin role checks in policies

## Triggers
- handle_new_user(): auto-creates a profile row when a new auth user signs up
- First registered user automatically gets admin role for bootstrap

## Indexes
- courses: unique on slug
- enrollments: unique on (user_id, course_id)
- progress: unique on (user_id, course_id)
*/

-- ============================================
-- TABLE: profiles (must exist before is_admin function)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- HELPER FUNCTION: is_admin (after profiles exists)
-- ============================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ============================================
-- PROFILES POLICIES
-- ============================================
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_own_or_admin"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id OR public.is_admin())
WITH CHECK (auth.uid() = id OR public.is_admin());

-- ============================================
-- TABLE: courses
-- ============================================
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  level text NOT NULL DEFAULT 'Beginner' CHECK (level IN ('Beginner', 'Intermediate', 'Advanced')),
  duration text NOT NULL DEFAULT '',
  thumbnail text,
  learning_outcomes text[] NOT NULL DEFAULT '{}',
  modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courses_select_published_or_admin" ON public.courses;
CREATE POLICY "courses_select_published_or_admin"
ON public.courses FOR SELECT
TO anon, authenticated
USING (is_published = true OR public.is_admin());

DROP POLICY IF EXISTS "courses_insert_admin" ON public.courses;
CREATE POLICY "courses_insert_admin"
ON public.courses FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "courses_update_admin" ON public.courses;
CREATE POLICY "courses_update_admin"
ON public.courses FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "courses_delete_admin" ON public.courses;
CREATE POLICY "courses_delete_admin"
ON public.courses FOR DELETE
TO authenticated
USING (public.is_admin());

-- ============================================
-- TABLE: enrollments
-- ============================================
CREATE TABLE IF NOT EXISTS public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, course_id)
);

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enrollments_select_own_or_admin" ON public.enrollments;
CREATE POLICY "enrollments_select_own_or_admin"
ON public.enrollments FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "enrollments_insert_own" ON public.enrollments;
CREATE POLICY "enrollments_insert_own"
ON public.enrollments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "enrollments_update_own_or_admin" ON public.enrollments;
CREATE POLICY "enrollments_update_own_or_admin"
ON public.enrollments FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR public.is_admin())
WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "enrollments_delete_own_or_admin" ON public.enrollments;
CREATE POLICY "enrollments_delete_own_or_admin"
ON public.enrollments FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.is_admin());

-- ============================================
-- TABLE: progress
-- ============================================
CREATE TABLE IF NOT EXISTS public.progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  completed_lessons jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_count integer NOT NULL DEFAULT 0,
  total_lessons integer NOT NULL DEFAULT 0,
  percentage integer NOT NULL DEFAULT 0,
  last_lesson_id text,
  last_accessed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, course_id)
);

ALTER TABLE public.progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "progress_select_own_or_admin" ON public.progress;
CREATE POLICY "progress_select_own_or_admin"
ON public.progress FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "progress_insert_own" ON public.progress;
CREATE POLICY "progress_insert_own"
ON public.progress FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "progress_update_own" ON public.progress;
CREATE POLICY "progress_update_own"
ON public.progress FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "progress_delete_admin" ON public.progress;
CREATE POLICY "progress_delete_admin"
ON public.progress FOR DELETE
TO authenticated
USING (public.is_admin());

-- ============================================
-- TRIGGER: Auto-create profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_count integer;
  display_name text;
BEGIN
  display_name := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  SELECT COUNT(*) INTO user_count FROM public.profiles;
  IF user_count = 0 THEN
    INSERT INTO public.profiles (id, name, role, is_active)
    VALUES (NEW.id, display_name, 'admin', true);
  ELSE
    INSERT INTO public.profiles (id, name, role, is_active)
    VALUES (NEW.id, display_name, 'user', true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON public.enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON public.enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON public.enrollments(status);
CREATE INDEX IF NOT EXISTS idx_progress_user ON public.progress(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_course ON public.progress(course_id);
CREATE INDEX IF NOT EXISTS idx_courses_published ON public.courses(is_published);
CREATE INDEX IF NOT EXISTS idx_courses_category ON public.courses(category);
CREATE INDEX IF NOT EXISTS idx_courses_level ON public.courses(level);
