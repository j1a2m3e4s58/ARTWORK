import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, FileText, Heart, List, ShoppingBag, X } from 'lucide-react';
import CommerceCheckout from '@/components/shop/CommerceCheckout';
import PageTransition from '@/components/PageTransition';
import ResourceFeedback from '@/components/ResourceFeedback';
import ScrollReveal from '@/components/ScrollReveal';
import SectionLabel from '@/components/SectionLabel';
import { useCollectionResource } from '@/hooks/useCollectionResource';
import { usePageContent } from '@/hooks/usePageContent';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/lib/AuthContext';
import { studioClient } from '@/api/studioClient';
import { parseCommerceOptions } from '@/lib/commerceOptions';
import { imageSrcSet, imageVariant } from '@/lib/media';

const typeBadge = {
  Print: 'bg-brass/10 text-brass',
  Framed: 'bg-violet/30 text-soft-pink',
  'Digital Download': 'bg-art-orange/10 text-art-orange',
  Original: 'bg-green-500/10 text-green-400',
};

export default function Shop() {
  const page = usePageContent('Shop');
  const commerceContent = usePageContent('Commerce');
  const commerce = parseCommerceOptions(commerceContent.commerce_settings);
  const { user } = useAuth();
  const settings = useSettings();
  const { data: products, loading, error, retry } = useCollectionResource('ShopProduct', { limit: 100 });
  const { data: priceGuides } = useCollectionResource('PriceGuide', { limit: 50 });
  const [filter, setFilter] = useState('All');
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('reigns_art_shop_cart') || '[]');
    } catch {
      return [];
    }
  });
  const [wishlist, setWishlist] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('reigns_art_shop_wishlist') || '[]');
    } catch {
      return [];
    }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [guidesOpen, setGuidesOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('reigns_art_shop_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem('reigns_art_shop_wishlist', JSON.stringify(wishlist));
    window.dispatchEvent(new Event('reigns-wishlist-changed'));
  }, [wishlist]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    studioClient.wishlist.list().then(ids => {
      if (!active) return;
      setWishlist(current => [...new Set([...current, ...ids])]);
    }).catch(() => {});
    return () => { active = false; };
  }, [user?.id]);

  const filtered = filter === 'All' ? products : products.filter(product => product.type === filter);
  const typeFilters = ['All', ...new Set(products.map(product => product.type).filter(Boolean))];
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const formatMoney = value => new Intl.NumberFormat(settings.locale || 'en-GH', {
    style: 'currency',
    currency: commerce.currency || settings.currency || 'GHS',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

  const addToCart = product => {
    setCart(current => {
      const existing = current.find(item => item.id === product.id);
      return existing
        ? current.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item)
        : [...current, { ...product, qty: 1 }];
    });
    setCartOpen(true);
  };
  const toggleWishlist = id => setWishlist(current => {
    const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
    if (user) studioClient.wishlist.set(id, next.includes(id)).catch(() => setWishlist(current));
    return next;
  });

  return (
    <PageTransition>
      <main className="min-h-screen bg-obsidian pb-28 pt-28">
        <div className="noise-overlay fixed inset-0 pointer-events-none opacity-30" />
        <header className="mx-auto mb-12 max-w-7xl px-5 sm:px-6 lg:px-12">
          <div className="flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <ScrollReveal><SectionLabel>{page.shop_label || 'The Studio Store'}</SectionLabel></ScrollReveal>
              <ScrollReveal delay={0.1}><h1 className="mt-2 font-display text-5xl text-ivory md:text-7xl">{page.shop_title || commerce.storeName || 'Art Shop'}</h1></ScrollReveal>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ivory/40 md:text-base">{page.shop_subtitle || commerce.storeSubtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2"><Link to={user?.role === 'partner' ? '/partner-portal' : '/partner-with-us'} className="flex min-h-12 items-center gap-2 border border-brass/30 px-4 text-sm text-brass transition-colors hover:border-brass/60">{user?.role === 'partner' ? 'Partner portal' : 'Sell with us'}</Link><button onClick={() => setCatalogueOpen(true)} className="flex min-h-12 items-center gap-2 border border-brass/30 px-4 text-sm text-brass transition-colors hover:border-brass/60"><List size={18} /> Art catalogue</button><button onClick={() => setGuidesOpen(true)} className="flex min-h-12 items-center gap-2 border border-brass/30 px-4 text-sm text-brass transition-colors hover:border-brass/60"><FileText size={18} /> Price guides</button><button onClick={() => setCartOpen(true)} className="relative flex min-h-12 w-fit items-center gap-2 border border-brass/30 px-5 text-sm text-ivory/70 transition-colors hover:border-brass/60 hover:text-brass">
              <ShoppingBag size={18} /> Your Bag
              {cartCount > 0 && <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-brass px-1 text-xs font-semibold text-obsidian">{cartCount}</span>}
            </button></div>
          </div>
        </header>

        <div className="mx-auto mb-10 flex max-w-7xl flex-wrap gap-2 px-5 sm:px-6 lg:px-12">
          {typeFilters.map(type => (
            <button key={type} onClick={() => setFilter(type)} className={`min-h-11 border px-5 text-xs uppercase tracking-widest transition-colors ${filter === type ? 'border-brass bg-brass text-obsidian' : 'border-brass/20 text-ivory/50 hover:border-brass/40'}`}>{type}</button>
          ))}
        </div>

        <section className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-12" aria-label="Art shop products">
          <ResourceFeedback loading={loading} error={error} onRetry={retry} empty={!filtered.length} emptyMessage="The art shop is being prepared. Please check back soon." />
          {!loading && !error && filtered.length > 0 && (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {filtered.map((product, index) => (
                  <motion.article key={product.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: index * 0.04 }} className="group overflow-hidden border border-brass/10 bg-carbon transition-colors hover:border-brass/25">
                    <div className="relative aspect-square overflow-hidden">
                      <img src={imageVariant(product.imageUrl, 768)} srcSet={imageSrcSet(product.imageUrl, [320, 480, 768])} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" alt={product.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
                      {product.isFeatured && <span className="absolute left-4 top-4 bg-brass px-3 py-1 text-[10px] uppercase tracking-widest text-obsidian">Featured</span>}
                      <button onClick={() => toggleWishlist(product.id)} aria-label={`${wishlist.includes(product.id) ? 'Remove' : 'Add'} ${product.title} ${wishlist.includes(product.id) ? 'from' : 'to'} wishlist`} className={`absolute right-4 top-4 flex h-10 w-10 items-center justify-center border bg-obsidian/55 ${wishlist.includes(product.id) ? 'border-brass text-brass' : 'border-ivory/20 text-ivory/60'}`}><Heart size={15} className={wishlist.includes(product.id) ? 'fill-brass' : ''} /></button>
                    </div>
                    <div className="p-5 sm:p-6">
                      <div className="flex items-start justify-between gap-3"><h2 className="font-display text-xl text-ivory">{product.title}</h2><span className={`shrink-0 px-2 py-1 text-[10px] uppercase tracking-widest ${typeBadge[product.type] || 'bg-ivory/5 text-ivory/50'}`}>{product.type || 'Art item'}</span></div>
                      {product.dimensions && <p className="mt-2 text-xs text-ivory/35">{product.dimensions}</p>}
                      <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-relaxed text-ivory/45">{product.description}</p>
                      <div className="mt-5 flex flex-col gap-3 min-[360px]:flex-row min-[360px]:items-center min-[360px]:justify-between">
                        <strong className="font-display text-2xl text-brass">{formatMoney(product.price)}</strong>
                        <button onClick={() => addToCart(product)} disabled={Number(product.inventory) === 0} className="flex min-h-11 items-center justify-center gap-2 bg-brass px-5 text-xs uppercase tracking-widest text-obsidian disabled:cursor-not-allowed disabled:opacity-35">Add to bag <ShoppingBag size={13} /></button>
                      </div>
                    </div>
                  </motion.article>
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>
      </main>

      <CommerceCheckout open={cartOpen} onClose={() => setCartOpen(false)} cart={cart} setCart={setCart} user={user} settings={settings} commerce={commerce} formatMoney={formatMoney} />
      <AnimatePresence>{catalogueOpen && <motion.div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><button aria-label="Close art catalogue" className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={() => setCatalogueOpen(false)} /><motion.section role="dialog" aria-modal="true" aria-label="Art catalogue and prices" className="relative flex max-h-[88dvh] w-full max-w-3xl flex-col border border-brass/25 bg-carbon shadow-2xl" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}><header className="flex items-center justify-between border-b border-brass/15 p-5 sm:p-6"><div><p className="text-[10px] uppercase tracking-[0.28em] text-brass">Studio store</p><h2 className="mt-1 font-display text-3xl text-ivory">Art catalogue & prices</h2><p className="mt-1 text-sm text-ivory/45">Current work, materials, prints and studio pieces.</p></div><button onClick={() => setCatalogueOpen(false)} className="flex h-11 w-11 items-center justify-center text-ivory/60 hover:text-brass"><X size={21} /></button></header><div className="min-h-0 space-y-2 overflow-y-auto p-4 sm:p-6">{products.map(product => <div key={product.id} className="flex gap-3 border border-brass/10 bg-obsidian/50 p-3"><img src={imageVariant(product.imageUrl, 160)} alt="" className="h-16 w-16 shrink-0 object-cover" loading="lazy"/><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><p className="truncate text-sm text-ivory">{product.title}</p><strong className="shrink-0 text-sm text-brass">{formatMoney(product.price)}</strong></div><p className="mt-1 text-xs text-ivory/40">{product.type || 'Art item'}{product.dimensions ? ` · ${product.dimensions}` : ''}</p></div></div>)}{!products.length && <p className="py-12 text-center text-sm text-ivory/40">The catalogue is being prepared.</p>}</div></motion.section></motion.div>}</AnimatePresence>
      <AnimatePresence>{guidesOpen && <motion.div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><button aria-label="Close price guides" className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={() => setGuidesOpen(false)} /><motion.section role="dialog" aria-modal="true" aria-label="Price guides" className="relative flex max-h-[88dvh] w-full max-w-2xl flex-col border border-brass/25 bg-carbon shadow-2xl" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}><header className="flex items-center justify-between border-b border-brass/15 p-5 sm:p-6"><div><p className="text-[10px] uppercase tracking-[.28em] text-brass">Studio pricing</p><h2 className="mt-1 font-display text-3xl text-ivory">Price guides</h2><p className="mt-1 text-sm text-ivory/45">Open online or download a PDF to keep.</p></div><button onClick={() => setGuidesOpen(false)} className="flex h-11 w-11 items-center justify-center text-ivory/60 hover:text-brass"><X size={21} /></button></header><div className="min-h-0 space-y-3 overflow-y-auto p-4 sm:p-6">{[...priceGuides].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)).map(guide => <article key={guide.id} className="border border-brass/15 bg-obsidian/50 p-4 sm:p-5"><div className="flex gap-3"><FileText size={24} className="mt-1 shrink-0 text-brass" /><div className="min-w-0"><h3 className="font-display text-2xl text-ivory">{guide.title}</h3><p className="mt-2 text-sm leading-6 text-ivory/50">{guide.description || 'Download this studio pricing guide.'}</p></div></div><div className="mt-5 flex flex-wrap gap-2"><a href={guide.fileUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 border border-brass/35 px-4 text-xs uppercase tracking-wider text-brass hover:border-brass"><FileText size={15} /> Open PDF</a><a href={guide.fileUrl} download className="inline-flex min-h-11 items-center gap-2 bg-brass px-4 text-xs uppercase tracking-wider text-obsidian"><Download size={15} /> Download</a></div></article>)}{!priceGuides.length && <p className="py-12 text-center text-sm text-ivory/40">Price guides are being prepared. Please check back soon.</p>}</div></motion.section></motion.div>}</AnimatePresence>
    </PageTransition>
  );
}
