import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { lazy, Suspense, useState } from 'react';
import LoadingScreen from '@/components/LoadingScreen';
import CustomCursor from '@/components/CustomCursor';
import Layout from '@/components/Layout';

import AdminRoute from '@/components/AdminRoute';
import AccountRoute from '@/components/AccountRoute';
import PWAUpdateBanner from '@/components/PWAUpdateBanner';
import AppErrorBoundary from '@/components/AppErrorBoundary';

const Home = lazy(() => import('@/pages/Home'));
const Gallery = lazy(() => import('@/pages/Gallery'));
const Commission = lazy(() => import('@/pages/Commission'));
const Shop = lazy(() => import('@/pages/Shop'));
const About = lazy(() => import('@/pages/About'));
const Blog = lazy(() => import('@/pages/Blog'));
const BlogPost = lazy(() => import('@/pages/BlogPost'));
const Contact = lazy(() => import('@/pages/Contact'));
const Testimonials = lazy(() => import('@/pages/Testimonials'));
const Admin = lazy(() => import('@/pages/Admin'));
const Videos = lazy(() => import('@/pages/Videos'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const LegalPage = lazy(() => import('@/pages/LegalPage'));
const Account = lazy(() => import('@/pages/Account'));
const AcceptInvite = lazy(() => import('@/pages/AcceptInvite'));
const VerifyEmail = lazy(() => import('@/pages/VerifyEmail'));

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-obsidian">
        <div className="w-8 h-8 border-2 border-brass/20 border-t-brass rounded-full animate-spin" />
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') { navigateToLogin(); return null; }
  }

  return (
    <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-obsidian"><div className="h-8 w-8 animate-spin rounded-full border-2 border-brass/20 border-t-brass" /></div>}>
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/commission" element={<Commission />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/about" element={<About />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/videos" element={<Videos />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/testimonials" element={<Testimonials />} />
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
        <Route path="/account" element={<AccountRoute><Account /></AccountRoute>} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/privacy" element={<LegalPage type="privacy" />} />
      <Route path="/terms" element={<LegalPage type="terms" />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
  );
};

function App() {
  const [loaded, setLoaded] = useState(() => sessionStorage.getItem('atelier_loaded') === 'true');
  const finishLoading = () => {
    sessionStorage.setItem('atelier_loaded', 'true');
    setLoaded(true);
  };

  return (
    <AppErrorBoundary>
    <AuthProvider>
        <Router>
          {!loaded && <LoadingScreen onComplete={finishLoading} />}
          {loaded && (
            <>
              <CustomCursor />
              <AuthenticatedApp />
            </>
          )}
        </Router>
        <PWAUpdateBanner />
    </AuthProvider>
    </AppErrorBoundary>
  );
}

export default App;
