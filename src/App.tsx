import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import VerifyEmail from '@/pages/VerifyEmail';
import VerifyLogin from '@/pages/VerifyLogin';
import ForgotPassword from '@/pages/ForgotPassword';
import Courses from '@/pages/Courses';
import CourseDetails from '@/pages/CourseDetails';
import CourseRoadmap from '@/pages/CourseRoadmap';
import Dashboard from '@/pages/Dashboard';
import MyCourses from '@/pages/MyCourses';
import SavedCourses from '@/pages/SavedCourses';
import CoursePlayer from '@/pages/CoursePlayer';
import Profile from '@/pages/Profile';
import Settings from '@/pages/Settings';
import Notifications from '@/pages/Notifications';
import PlaylistCourse from '@/pages/PlaylistCourse';
import Pricing from '@/pages/Pricing';
import Billing from '@/pages/Billing';
import AdminLayout, { AdminGuard } from '@/pages/admin/AdminLayout';
import AdminControlCenter from '@/pages/admin/AdminControlCenter';
import AdminUsersPro from '@/pages/admin/AdminUsersPro';
import AdminCoursesPro from '@/pages/admin/AdminCoursesPro';
import AdminPlans from '@/pages/admin/AdminPlans';
import AdminBilling from '@/pages/admin/AdminBilling';
import AdminCommunications from '@/pages/admin/AdminCommunications';
import AdminSettings from '@/pages/admin/AdminSettings';
import AdminAudit from '@/pages/admin/AdminAudit';
import AdminCoupons from '@/pages/admin/AdminCoupons';
import AdminAnalytics from '@/pages/admin/AdminAnalytics';

function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isPlayerPage = pathname.startsWith('/learn/') || pathname.startsWith('/playlists/') || pathname.startsWith('/courses/') && pathname.endsWith('/roadmap');
  const isAdmin = pathname.startsWith('/admin');
  return <div className="flex min-h-screen flex-col">{!isPlayerPage && !isAdmin && <Navbar />}<main className="flex-1">{children}</main>{!isPlayerPage && !isAdmin && <Footer />}</div>;
}

function AdminPage({ children }: { children: React.ReactNode }) {
  return <AdminGuard><AdminLayout>{children}</AdminLayout></AdminGuard>;
}

function App() {
  return <AuthProvider><BrowserRouter useTransitions={false}><Layout><Routes>
    <Route path="/" element={<Home />} /><Route path="/login" element={<Login />} /><Route path="/register" element={<Register />} />
    <Route path="/verify-email" element={<VerifyEmail />} /><Route path="/verify-login" element={<VerifyLogin />} /><Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/courses" element={<Courses />} /><Route path="/pricing" element={<Pricing />} /><Route path="/courses/:courseId" element={<CourseDetails />} /><Route path="/courses/:courseId/roadmap" element={<ProtectedRoute><CourseRoadmap /></ProtectedRoute>} />
    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} /><Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
    <Route path="/my-courses" element={<ProtectedRoute><MyCourses /></ProtectedRoute>} />
    <Route path="/saved-courses" element={<ProtectedRoute><SavedCourses /></ProtectedRoute>} />
    <Route path="/learn/:courseId" element={<ProtectedRoute><CoursePlayer /></ProtectedRoute>} />
    <Route path="/learn/:courseId/:lessonId" element={<ProtectedRoute><CoursePlayer /></ProtectedRoute>} />
    <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
    <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
    <Route path="/playlists/:playlistId" element={<ProtectedRoute><PlaylistCourse /></ProtectedRoute>} />

    <Route path="/admin/login" element={<Navigate to="/login" replace />} />
    <Route path="/admin" element={<AdminPage><AdminControlCenter /></AdminPage>} />
    <Route path="/admin/analytics" element={<AdminPage><AdminAnalytics /></AdminPage>} />
    <Route path="/admin/users" element={<AdminPage><AdminUsersPro /></AdminPage>} />
    <Route path="/admin/courses" element={<AdminPage><AdminCoursesPro /></AdminPage>} />
    <Route path="/admin/plans" element={<AdminPage><AdminPlans /></AdminPage>} />
    <Route path="/admin/billing" element={<AdminPage><AdminBilling /></AdminPage>} />
    <Route path="/admin/communications" element={<AdminPage><AdminCommunications /></AdminPage>} />
    <Route path="/admin/coupons" element={<AdminPage><AdminCoupons /></AdminPage>} />
    <Route path="/admin/settings" element={<AdminPage><AdminSettings /></AdminPage>} />
    <Route path="/admin/audit" element={<AdminPage><AdminAudit /></AdminPage>} />
    <Route path="*" element={<Home />} />
  </Routes></Layout></BrowserRouter></AuthProvider>;
}
export default App;
