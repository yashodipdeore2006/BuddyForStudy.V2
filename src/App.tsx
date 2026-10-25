import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import FeatureUpgradeModal from '@/components/FeatureUpgradeModal';
import CookieConsentManager from "@/components/CookieConsentManager";
import AccountConsentGate from "@/components/AccountConsentGate";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";
const Home = lazy(() => import('@/pages/Home'));
const About = lazy(() => import('@/pages/About'));
const Contact = lazy(() => import('@/pages/Contact'));
const FAQ = lazy(() => import('@/pages/FAQ'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const VerifyEmail = lazy(() => import('@/pages/VerifyEmail'));
const VerifyLogin = lazy(() => import('@/pages/VerifyLogin'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const Courses = lazy(() => import('@/pages/Courses'));
const CourseDetails = lazy(() => import('@/pages/CourseDetails'));
const CourseRoadmap = lazy(() => import('@/pages/CourseRoadmap'));
const MyCourses = lazy(() => import('@/pages/MyCourses'));
const SavedCourses = lazy(() => import('@/pages/SavedCourses'));
const CoursePlayer = lazy(() => import('@/pages/CoursePlayer'));
const Profile = lazy(() => import('@/pages/Profile'));
const Settings = lazy(() => import('@/pages/Settings'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const PlaylistCourse = lazy(() => import('@/pages/PlaylistCourse'));
const SavedRoadmap = lazy(() => import('@/pages/SavedRoadmap'));
const Pricing = lazy(() => import('@/pages/Pricing'));
const Billing = lazy(() => import('@/pages/Billing'));
import AdminLayout, { AdminGuard } from '@/pages/admin/AdminLayout';
const AdminControlCenter = lazy(() => import('@/pages/admin/AdminControlCenter'));
const AdminDesignSystem = lazy(() => import('@/pages/admin/AdminDesignSystem'));
const AdminUsersPro = lazy(() => import('@/pages/admin/AdminUsersPro'));
const AdminCoursesPro = lazy(() => import('@/pages/admin/AdminCoursesPro'));
const AdminContentQuality = lazy(() => import('@/pages/admin/AdminContentQuality'));
const AdminRoadmaps = lazy(() => import('@/pages/admin/AdminRoadmaps'));
const AdminPlans = lazy(() => import('@/pages/admin/AdminPlans'));
const AdminTrialCampaigns = lazy(() => import('@/pages/admin/AdminTrialCampaigns'));
const AdminBilling = lazy(() => import('@/pages/admin/AdminBilling'));
const AdminSubscriptions = lazy(() => import('@/pages/admin/AdminSubscriptions'));
const AdminCommunications = lazy(() => import('@/pages/admin/AdminCommunications'));
const AdminDeliveries = lazy(() => import('@/pages/admin/AdminDeliveries'));
const AdminNotifications = lazy(() => import('@/pages/admin/AdminNotifications'));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'));
const AdminAudit = lazy(() => import('@/pages/admin/AdminAudit'));
const AdminCoupons = lazy(() => import('@/pages/admin/AdminCoupons'));
const AdminAnalytics = lazy(() => import('@/pages/admin/AdminAnalytics'));
const AdminRoles = lazy(() => import('@/pages/admin/AdminRoles'));
const AdminAIContent = lazy(() => import('@/pages/admin/AdminAIContent'));
const AdminSupport = lazy(() => import('@/pages/admin/AdminSupport'));
const AdminOperations = lazy(() => import('@/pages/admin/AdminOperations'));
const AdminLegalDocuments = lazy(() => import('@/pages/admin/AdminLegalDocuments'));
const AdminPricingStudio = lazy(() => import('@/pages/admin/AdminPricingStudio'));
const LegalPage = lazy(() => import('@/pages/LegalPage'));
const AcceptAdminInvitation = lazy(() => import('@/pages/AcceptAdminInvitation'));
import { Link } from 'react-router-dom';
import { routes } from '@/lib/routes';


function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isPlayerPage = pathname.startsWith('/learn/') || pathname.startsWith('/playlists/') || pathname.startsWith('/courses/') && pathname.endsWith('/roadmap');
  const isAdmin = pathname.startsWith('/admin');
  return <div className="flex min-h-screen flex-col">{!isPlayerPage && !isAdmin && <Navbar />}<main className="flex-1">{children}</main>{!isPlayerPage && !isAdmin && <Footer />}<FeatureUpgradeModal /><CookieConsentManager /><AccountConsentGate /><PushNotificationPrompt /></div>;
}

function AdminPage({ children }: { children: React.ReactNode }) {
  return <AdminGuard><AdminLayout>{children}</AdminLayout></AdminGuard>;
}

function NotFound() {
  return <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
    <p className="text-sm font-semibold text-violet-700">404</p>
    <h1 className="mt-2 text-3xl font-bold text-slate-950">Page not found</h1>
    <p className="mt-3 text-sm text-slate-600">The page may have moved or the address may be incorrect.</p>
    <Link to={routes.home()} className="btn-primary mt-6">Go to Home</Link>
  </div>;
}

function App() {
  return <AuthProvider><BrowserRouter useTransitions={false}><Layout><Suspense fallback={<div role="status" aria-live="polite" className="flex min-h-[45vh] items-center justify-center text-sm font-semibold text-slate-500">Loading page…</div>}><Routes>
    <Route path="/" element={<Home />} /><Route path="/home" element={<Home />} /><Route path="/about" element={<About />} /><Route path="/about-us" element={<Navigate to="/about" replace />} /><Route path="/contact" element={<Contact />} /><Route path="/contact-us" element={<Navigate to="/contact" replace />} /><Route path="/faq" element={<FAQ />} /><Route path="/help" element={<Navigate to="/faq" replace />} /><Route path="/login" element={<Login />} /><Route path="/register" element={<Register />} />
    <Route path="/accept-admin-invitation" element={<AcceptAdminInvitation />} /><Route path="/verify-email" element={<VerifyEmail />} /><Route path="/verify-login" element={<VerifyLogin />} /><Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/courses" element={<Navigate to={routes.explore()} replace />} /><Route path="/explore" element={<Courses />} /><Route path="/pricing" element={<Pricing />} /><Route path="/legal" element={<LegalPage />} /><Route path="/legal/:slug" element={<LegalPage />} /><Route path="/courses/:courseId" element={<CourseDetails />} /><Route path="/courses/:courseId/roadmap" element={<CourseRoadmap />} />
    <Route path="/dashboard" element={<Navigate to={routes.home()} replace />} /><Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
    <Route path="/my-courses" element={<Navigate to={routes.myLearning()} replace />} /><Route path="/my-learning" element={<ProtectedRoute><MyCourses /></ProtectedRoute>} />
    <Route path="/saved-courses" element={<Navigate to={routes.saved()} replace />} /><Route path="/saved" element={<ProtectedRoute><SavedCourses /></ProtectedRoute>} />
    <Route path="/learn/:courseId" element={<ProtectedRoute><CoursePlayer /></ProtectedRoute>} />
    <Route path="/learn/:courseId/:lessonId" element={<ProtectedRoute><CoursePlayer /></ProtectedRoute>} />
    <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
    <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
    <Route path="/playlists/:playlistId" element={<ProtectedRoute><PlaylistCourse /></ProtectedRoute>} />
    <Route path="/roadmaps/:roadmapId" element={<ProtectedRoute><SavedRoadmap /></ProtectedRoute>} />

    <Route path="/admin/login" element={<Navigate to={routes.login()} replace />} />
    <Route path="/admin" element={<AdminPage><AdminControlCenter /></AdminPage>} />
    <Route path="/admin/analytics" element={<AdminPage><AdminAnalytics /></AdminPage>} />
    <Route path="/admin/users" element={<AdminPage><AdminUsersPro /></AdminPage>} />
    <Route path="/admin/courses" element={<AdminPage><AdminCoursesPro /></AdminPage>} />
    <Route path="/admin/content-quality" element={<AdminPage><AdminContentQuality /></AdminPage>} />
    <Route path="/admin/roadmaps" element={<AdminPage><AdminRoadmaps /></AdminPage>} />
    <Route path="/admin/plans" element={<AdminPage><AdminPlans /></AdminPage>} />
    <Route path="/admin/trials" element={<AdminPage><AdminTrialCampaigns /></AdminPage>} />
    <Route path="/admin/pricing" element={<AdminPage><AdminPricingStudio /></AdminPage>} />
    <Route path="/admin/billing" element={<AdminPage><AdminBilling /></AdminPage>} />
    <Route path="/admin/subscriptions" element={<AdminPage><AdminSubscriptions /></AdminPage>} />
    <Route path="/admin/communications" element={<AdminPage><AdminCommunications /></AdminPage>} />
    <Route path="/admin/deliveries" element={<AdminPage><AdminDeliveries /></AdminPage>} />
    <Route path="/admin/notifications" element={<AdminPage><AdminNotifications /></AdminPage>} />
    <Route path="/admin/coupons" element={<AdminPage><AdminCoupons /></AdminPage>} />
    <Route path="/admin/settings" element={<AdminPage><AdminSettings /></AdminPage>} />
    <Route path="/admin/legal" element={<AdminPage><AdminLegalDocuments /></AdminPage>} />
    <Route path="/admin/design-system" element={<AdminPage><AdminDesignSystem /></AdminPage>} />
    <Route path="/admin/audit" element={<AdminPage><AdminAudit /></AdminPage>} />
    <Route path="/admin/roles" element={<AdminPage><AdminRoles /></AdminPage>} />
    <Route path="/admin/ai-content" element={<AdminPage><AdminAIContent /></AdminPage>} />
    <Route path="/admin/support" element={<AdminPage><AdminSupport /></AdminPage>} />
    <Route path="/admin/operations" element={<AdminPage><AdminOperations /></AdminPage>} />
    <Route path="*" element={<NotFound />} />
  </Routes></Suspense></Layout></BrowserRouter></AuthProvider>;
}
export default App;
