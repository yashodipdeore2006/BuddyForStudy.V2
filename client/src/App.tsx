import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import FeatureUpgradeModal from '@/components/FeatureUpgradeModal';
import CookieConsentManager from "@/components/CookieConsentManager";
import AccountConsentGate from "@/components/AccountConsentGate";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";
import Home from '@/pages/Home';
import About from '@/pages/About';
import Contact from '@/pages/Contact';
import FAQ from '@/pages/FAQ';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import VerifyEmail from '@/pages/VerifyEmail';
import VerifyLogin from '@/pages/VerifyLogin';
import ForgotPassword from '@/pages/ForgotPassword';
import Courses from '@/pages/Courses';
import CourseDetails from '@/pages/CourseDetails';
import CourseRoadmap from '@/pages/CourseRoadmap';
import MyCourses from '@/pages/MyCourses';
import SavedCourses from '@/pages/SavedCourses';
import CoursePlayer from '@/pages/CoursePlayer';
import Profile from '@/pages/Profile';
import Settings from '@/pages/Settings';
import Notifications from '@/pages/Notifications';
import PlaylistCourse from '@/pages/PlaylistCourse';
import SavedRoadmap from '@/pages/SavedRoadmap';
import Pricing from '@/pages/Pricing';
import Billing from '@/pages/Billing';
import AdminLayout, { AdminGuard } from '@/pages/admin/AdminLayout';
import AdminControlCenter from '@/pages/admin/AdminControlCenter';
import AdminDesignSystem from '@/pages/admin/AdminDesignSystem';
import AdminUsersPro from '@/pages/admin/AdminUsersPro';
import AdminCoursesPro from '@/pages/admin/AdminCoursesPro';
import AdminContentQuality from '@/pages/admin/AdminContentQuality';
import AdminRoadmaps from '@/pages/admin/AdminRoadmaps';
import AdminPlans from '@/pages/admin/AdminPlans';
import AdminBilling from '@/pages/admin/AdminBilling';
import AdminSubscriptions from '@/pages/admin/AdminSubscriptions';
import AdminCommunications from '@/pages/admin/AdminCommunications';
import AdminDeliveries from '@/pages/admin/AdminDeliveries';
import AdminSettings from '@/pages/admin/AdminSettings';
import AdminAudit from '@/pages/admin/AdminAudit';
import AdminCoupons from '@/pages/admin/AdminCoupons';
import AdminAnalytics from '@/pages/admin/AdminAnalytics';
import AdminRoles from '@/pages/admin/AdminRoles';
import AdminAIContent from '@/pages/admin/AdminAIContent';
import AdminSupport from '@/pages/admin/AdminSupport';
import AdminOperations from '@/pages/admin/AdminOperations';
import AdminLegalDocuments from '@/pages/admin/AdminLegalDocuments';
import AdminPricingStudio from '@/pages/admin/AdminPricingStudio';
import LegalPage from '@/pages/LegalPage';
import AcceptAdminInvitation from '@/pages/AcceptAdminInvitation';
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
  return <AuthProvider><BrowserRouter useTransitions={false}><Layout><Routes>
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
    <Route path="/admin/pricing" element={<AdminPage><AdminPricingStudio /></AdminPage>} />
    <Route path="/admin/billing" element={<AdminPage><AdminBilling /></AdminPage>} />
    <Route path="/admin/subscriptions" element={<AdminPage><AdminSubscriptions /></AdminPage>} />
    <Route path="/admin/communications" element={<AdminPage><AdminCommunications /></AdminPage>} />
    <Route path="/admin/deliveries" element={<AdminPage><AdminDeliveries /></AdminPage>} />
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
  </Routes></Layout></BrowserRouter></AuthProvider>;
}
export default App;
