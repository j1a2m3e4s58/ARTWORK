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
    <div className={`${isMessageWorkspace ? 'h-dvh overflow-hidden' : 'min-h-screen pb-20 md:pb-0'} bg-obsidian text-ivory`}>
      <Navbar />
      <ServiceNotice />
      {!isMessageWorkspace && <FloatingSocial />}
      <main className={isMessageWorkspace ? 'h-full overflow-hidden' : undefined}>
        <Outlet />
      </main>
      {!isMessageWorkspace && <Footer />}
      {!isMessageWorkspace && <FloatingActions />}
      <MobileBottomNav />
    </div>
  );
}
