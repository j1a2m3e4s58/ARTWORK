import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import FloatingSocial from './FloatingSocial';
import FloatingActions from './FloatingActions';
import MobileBottomNav from './MobileBottomNav';
import ServiceNotice from './ServiceNotice';

export default function Layout() {
  return (
    <div className="min-h-screen bg-obsidian pb-20 text-ivory md:pb-0">
      <Navbar />
      <ServiceNotice />
      <FloatingSocial />
      <main>
        <Outlet />
      </main>
      <Footer />
      <FloatingActions />
      <MobileBottomNav />
    </div>
  );
}
