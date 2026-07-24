import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import FloatingSocial from './FloatingSocial';
import BackToTop from './BackToTop';
import WhatsAppButton from './WhatsAppButton';

export default function Layout() {
  return (
    <div className="min-h-screen bg-obsidian text-ivory">
      <Navbar />
      <FloatingSocial />
      <main>
        <Outlet />
      </main>
      <Footer />
      <BackToTop />
      <WhatsAppButton />
    </div>
  );
}