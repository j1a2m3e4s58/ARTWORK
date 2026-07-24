import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import FloatingSocial from './FloatingSocial';
import BackToTop from './BackToTop';
import WhatsAppButton from './WhatsAppButton';
import MobileBottomNav from './MobileBottomNav';
import SiteMetadata from './SiteMetadata';

export default function Layout() {
  return (
    <div className="min-h-screen bg-obsidian pb-20 text-ivory md:pb-0">
      <Navbar />
      <SiteMetadata />
      <FloatingSocial />
      <main>
        <Outlet />
      </main>
      <Footer />
      <BackToTop />
      <WhatsAppButton />
      <MobileBottomNav />
    </div>
  );
}
