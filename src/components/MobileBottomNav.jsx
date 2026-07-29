import { Link, useLocation } from 'react-router-dom';
import { Home, Images, Palette, ShoppingBag, MessageCircle } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';

const items = [
  { label: 'Home', path: '/', icon: Home },
  { label: 'Gallery', path: '/gallery', icon: Images },
  { label: 'Create', path: '/commission', icon: Palette },
  { label: 'Art Shop', path: '/shop', icon: ShoppingBag, settingKey: 'show_shop' },
  { label: 'Contact', path: '/contact', icon: MessageCircle },
];

export default function MobileBottomNav() {
  const location = useLocation();
  const settings = useSettings();
  const visibleItems = items.filter(item => {
    if (item.path === '/') return true;
    const key = item.settingKey || `show_${item.label === 'Create' ? 'commission' : item.label.toLowerCase()}`;
    return settings[key] !== 'false';
  });

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 box-border w-full max-w-full isolate overflow-hidden overscroll-none border-t border-brass/15 bg-obsidian/95 px-2 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl [transform:translateZ(0)] md:hidden"
      aria-label="Mobile navigation"
    >
      <div className="mx-auto flex w-full max-w-md justify-around">
        {visibleItems.map(({ label, path, icon: Icon }) => {
          const active = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
          return (
            <Link
              key={path}
              to={path}
              className={`relative min-w-0 flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl font-tight text-[10px] tracking-wide transition-colors ${
                active ? 'text-brass' : 'text-ivory/45 hover:text-ivory'
              }`}
            >
              {active && <span className="absolute inset-x-3 inset-y-0 rounded-xl bg-brass/10" />}
              <Icon className="relative" size={19} strokeWidth={active ? 2 : 1.6} />
              <span className="relative">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
