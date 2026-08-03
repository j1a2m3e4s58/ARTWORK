import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import FloatingSocial from './FloatingSocial';
import FloatingActions from './FloatingActions';
import MobileBottomNav from './MobileBottomNav';
import ServiceNotice from './ServiceNotice';

export default function Layout() {
  const location = useLocation();
  const isMessageWorkspace = location.pathname === '/messages';

  return (
    <div className="min-h-screen bg-obsidian pb-20 text-ivory md:pb-0">
      <Navbar />
      <ServiceNotice />
      {!isMessageWorkspace && <FloatingSocial />}
      <main>
        <Outlet />
      </main>
      <Footer />
      {!isMessageWorkspace && <FloatingActions />}
      <MobileBottomNav />
    </div>
  );
}
