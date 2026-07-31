import { useEffect, useMemo, useState } from 'react';
import { Heart, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageTransition from '@/components/PageTransition';
import ResourceFeedback from '@/components/ResourceFeedback';
import { useCollectionResource } from '@/hooks/useCollectionResource';
import { useSettings } from '@/hooks/useSettings';
import { parseCommerceOptions } from '@/lib/commerceOptions';
import { usePageContent } from '@/hooks/usePageContent';
import { imageVariant } from '@/lib/media';
import { useAuth } from '@/lib/AuthContext';
import { studioClient } from '@/api/studioClient';

const getSavedIds = () => {
  try { return JSON.parse(localStorage.getItem('reigns_art_shop_wishlist') || '[]'); }
  catch { return []; }
};

export default function Wishlist() {
  const { user } = useAuth();
  const settings = useSettings();
  const commerceContent = usePageContent('Commerce');
  const commerce = parseCommerceOptions(commerceContent.commerce_settings);
  const { data: products, loading, error, retry } = useCollectionResource('ShopProduct', { limit: 100 });
  const [savedIds, setSavedIds] = useState(getSavedIds);

  useEffect(() => {
    const refresh = () => setSavedIds(getSavedIds());
    window.addEventListener('storage', refresh);
    window.addEventListener('reigns-wishlist-changed', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('reigns-wishlist-changed', refresh);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    studioClient.wishlist.list().then(ids => setSavedIds(current => [...new Set([...current, ...ids])])).catch(() => {});
  }, [user?.id]);

  const saved = useMemo(() => products.filter(item => savedIds.includes(item.id)), [products, savedIds]);
  const formatMoney = value => new Intl.NumberFormat(settings.locale || 'en-GH', {
    style: 'currency', currency: commerce.currency || settings.currency || 'GHS', maximumFractionDigits: 2,
  }).format(Number(value) || 0);
  const remove = id => {
    const next = savedIds.filter(item => item !== id);
    localStorage.setItem('reigns_art_shop_wishlist', JSON.stringify(next));
    setSavedIds(next);
    if (user) studioClient.wishlist.set(id, false).catch(() => {});
    window.dispatchEvent(new Event('reigns-wishlist-changed'));
  };

  return <PageTransition><main className="min-h-screen bg-obsidian px-5 pb-24 pt-28 sm:px-6 lg:px-12">
    <section className="mx-auto max-w-7xl">
      <p className="text-xs uppercase tracking-[.3em] text-brass/70">Saved for later</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-display text-5xl text-ivory sm:text-6xl">My Wishlist</h1><p className="mt-3 text-sm text-ivory/50">{user ? 'Your saved art pieces sync securely with your account.' : 'Your saved art pieces are kept on this device. Sign in to keep them across devices.'}</p></div><Link to="/shop" className="inline-flex min-h-11 items-center gap-2 border border-brass/30 px-4 text-sm text-brass hover:border-brass"><ShoppingBag size={16} /> Visit art shop</Link></div>

      <ResourceFeedback loading={loading} error={error} onRetry={retry} />
      {!loading && !error && !saved.length && <section className="mt-10 flex min-h-72 flex-col items-center justify-center border border-dashed border-brass/20 bg-carbon/40 p-8 text-center"><Heart size={38} className="text-brass/55" /><h2 className="mt-5 font-display text-3xl text-ivory">Your wishlist is empty</h2><p className="mt-2 max-w-md text-sm leading-6 text-ivory/45">Tap the heart on any item in the Art Shop to save it here for later.</p><Link to="/shop" className="mt-6 bg-brass px-5 py-3 text-xs uppercase tracking-widest text-obsidian">Browse the art shop</Link></section>}
      {!!saved.length && <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {saved.map(product => <article key={product.id} className="overflow-hidden border border-brass/15 bg-carbon"><img src={imageVariant(product.imageUrl, 768)} alt={product.title} className="aspect-square w-full object-cover" /><div className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-widest text-brass/65">{product.type || 'Art item'}</p><h2 className="mt-1 font-display text-xl text-ivory">{product.title}</h2></div><button onClick={() => remove(product.id)} aria-label={`Remove ${product.title} from wishlist`} className="flex h-10 w-10 shrink-0 items-center justify-center border border-brass/20 text-brass hover:bg-brass hover:text-obsidian"><Heart size={16} className="fill-current" /></button></div><p className="mt-4 font-display text-2xl text-brass">{formatMoney(product.price)}</p><Link to="/shop" className="mt-5 inline-flex min-h-11 items-center gap-2 border border-brass/25 px-4 text-sm text-brass hover:border-brass">View in art shop <ShoppingBag size={15} /></Link></div></article>)}
      </div>}
    </section>
  </main></PageTransition>;
}
