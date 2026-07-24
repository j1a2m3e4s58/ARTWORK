import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Heart, X, Plus, Minus, ArrowRight, MessageCircle } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import ScrollReveal from '@/components/ScrollReveal';
import SectionLabel from '@/components/SectionLabel';
import PageTransition from '@/components/PageTransition';
import { useSettings } from '@/hooks/useSettings';

const TYPE_FILTERS = ['All', 'Print', 'Framed', 'Digital Download', 'Original'];
const typeBadge = { Print: 'bg-brass/10 text-brass', Framed: 'bg-violet/30 text-soft-pink', 'Digital Download': 'bg-art-orange/10 text-art-orange', Original: 'bg-green-500/10 text-green-400' };

const DEMO_PRODUCTS = [
  { id: 'd1', title: 'Ethereal Gaze — Fine Print', type: 'Print', price: 45, imageUrl: 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=600&q=85', dimensions: '30×42cm (A3)', description: 'Premium archival giclée print on 300gsm fine art paper.', isFeatured: true },
  { id: 'd2', title: 'Shadow Forms — Framed Original', type: 'Framed', price: 380, imageUrl: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=600&q=85', dimensions: '50×70cm', description: 'Original charcoal on paper, museum-quality black frame.', isFeatured: true },
  { id: 'd3', title: 'Digital Reverie — Download', type: 'Digital Download', price: 18, imageUrl: 'https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=600&q=85', dimensions: '4K (3840×5760px)', description: 'High-resolution digital file for personal use and printing.', isFeatured: false },
  { id: 'd4', title: 'Graphite Soul — Framed Print', type: 'Framed', price: 120, imageUrl: 'https://images.unsplash.com/photo-1519764622345-23439dd774f7?w=600&q=85', dimensions: '21×29cm (A4)', description: 'Archival print, hand-signed, in a premium wooden frame.', isFeatured: false },
  { id: 'd5', title: 'Sakura Mind — Print', type: 'Print', price: 55, imageUrl: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&q=85', dimensions: '42×59cm (A2)', description: 'Vivid archival print, limited edition of 50.', isFeatured: true },
  { id: 'd6', title: 'Noir Study — Digital Bundle', type: 'Digital Download', price: 28, imageUrl: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=600&q=85', dimensions: '5 files, 4K each', description: 'Bundle of 5 digital artworks for personal use.', isFeatured: false },
];

export default function Shop() {
  const settings = useSettings();
  const [products, setProducts] = useState(DEMO_PRODUCTS);
  const [filter, setFilter] = useState('All');
  const [cart, setCart] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    studioClient.entities.ShopProduct.list('-created_date', 100).then(data => {
      if (data.length > 0) setProducts(data);
    }).catch(() => {});
  }, []);

  const filtered = filter === 'All' ? products : products.filter(p => p.type === filter);

  const addToCart = (product) => {
    setCart(prev => {
      const ex = prev.find(i => i.id === product.id);
      if (ex) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...product, qty: 1 }];
    });
    setCartOpen(true);
  };

  const removeFromCart = (id) => setCart(prev => prev.filter(i => i.id !== id));
  const toggleWishlist = (id) => setWishlist(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <PageTransition>
      <div className="min-h-screen bg-obsidian pt-28 pb-24">
        <div className="noise-overlay fixed inset-0 pointer-events-none opacity-30" />

        {/* Header */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-16">
          <div className="flex items-end justify-between">
            <div>
              <ScrollReveal><SectionLabel>The Boutique</SectionLabel></ScrollReveal>
              <ScrollReveal delay={0.1}>
                <h1 className="font-display text-5xl md:text-7xl text-ivory mt-2">Art <em className="text-brass">Shop</em></h1>
              </ScrollReveal>
            </div>
            <ScrollReveal delay={0.2} direction="left">
              <button onClick={() => setCartOpen(true)} className="relative flex items-center gap-2 border border-brass/30 text-ivory/70 px-5 py-3 hover:border-brass/60 hover:text-brass transition-all">
                <ShoppingBag size={18} />
                <span className="font-tight text-sm">Cart</span>
                {cartCount > 0 && <span className="absolute -top-2 -right-2 w-5 h-5 bg-brass text-obsidian text-xs font-tight flex items-center justify-center">{cartCount}</span>}
              </button>
            </ScrollReveal>
          </div>
        </div>

        {/* Filters */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-12 flex flex-wrap gap-2">
          {TYPE_FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`font-tight text-xs uppercase tracking-widest px-5 py-2.5 border transition-all duration-300 ${filter === f ? 'bg-brass text-obsidian border-brass' : 'border-brass/20 text-ivory/50 hover:border-brass/40'}`}>
              {f}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          {filtered.length === 0 ? (
            <div className="text-center py-24"><p className="text-ivory/30 font-tight">No products found.</p></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {filtered.map((product, i) => (
                  <motion.div key={product.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.06 }}>
                    <div className="group bg-carbon border border-brass/10 hover:border-brass/25 transition-all duration-300 overflow-hidden">
                      <div className="relative aspect-square overflow-hidden">
                        <img src={product.imageUrl} alt={product.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
                        <div className="absolute inset-0 bg-obsidian/0 group-hover:bg-obsidian/20 transition-colors duration-300" />
                        {product.isFeatured && <div className="absolute top-4 left-4 bg-brass text-obsidian font-tight text-[10px] px-3 py-1 tracking-widest uppercase">Featured</div>}
                        <button onClick={() => toggleWishlist(product.id)}
                          className={`absolute top-4 right-4 w-9 h-9 flex items-center justify-center border transition-all duration-200 ${wishlist.includes(product.id) ? 'border-brass bg-brass/20 text-brass' : 'border-ivory/20 text-ivory/60 bg-obsidian/40 hover:border-brass/40'}`}>
                          <Heart size={14} className={wishlist.includes(product.id) ? 'fill-brass' : ''} />
                        </button>
                      </div>
                      <div className="p-6">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-display text-xl text-ivory leading-tight flex-1 mr-4">{product.title}</h3>
                          <span className={`font-tight text-[10px] px-2 py-1 uppercase tracking-widest flex-shrink-0 ${typeBadge[product.type] || 'bg-muted text-ivory/50'}`}>{product.type}</span>
                        </div>
                        {product.dimensions && <p className="text-ivory/40 text-xs font-tight mb-1">{product.dimensions}</p>}
                        <p className="text-ivory/50 text-sm leading-relaxed mb-5 line-clamp-2">{product.description}</p>
                        <div className="flex items-center justify-between">
                          <span className="font-display text-2xl text-brass">${product.price}</span>
                          <button onClick={() => addToCart(product)}
                            className="flex items-center gap-2 bg-brass text-obsidian px-5 py-2.5 font-tight text-xs tracking-widest uppercase hover:bg-brass-light transition-all duration-300">
                            Add to Cart <ShoppingBag size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Cart drawer */}
      <AnimatePresence>
        {cartOpen && (
          <>
            <motion.div className="fixed inset-0 bg-obsidian/70 backdrop-blur-sm z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCartOpen(false)} />
            <motion.div className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-carbon border-l border-brass/10 z-50 flex flex-col"
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
              <div className="flex items-center justify-between p-6 border-b border-brass/10">
                <h2 className="font-display text-2xl text-ivory">Cart <span className="text-brass/60 text-lg">({cartCount})</span></h2>
                <button onClick={() => setCartOpen(false)} className="text-ivory/40 hover:text-brass transition-colors"><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {cart.length === 0 ? (
                  <div className="text-center py-16">
                    <ShoppingBag size={36} className="text-brass/20 mx-auto mb-3" />
                    <p className="text-ivory/30 font-tight text-sm">Your cart is empty</p>
                  </div>
                ) : cart.map(item => (
                  <div key={item.id} className="flex gap-4 border border-brass/10 p-4">
                    {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-16 h-16 object-cover flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-ivory/80 text-sm font-tight leading-tight">{item.title}</p>
                      <p className="text-brass text-sm font-display mt-1">${item.price}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <button onClick={() => item.qty > 1 ? setCart(c => c.map(i => i.id === item.id ? { ...i, qty: i.qty - 1 } : i)) : removeFromCart(item.id)} className="w-6 h-6 border border-brass/20 flex items-center justify-center text-ivory/60 hover:border-brass/40 transition-colors"><Minus size={10} /></button>
                        <span className="text-ivory/70 text-xs w-4 text-center">{item.qty}</span>
                        <button onClick={() => setCart(c => c.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i))} className="w-6 h-6 border border-brass/20 flex items-center justify-center text-ivory/60 hover:border-brass/40 transition-colors"><Plus size={10} /></button>
                      </div>
                    </div>
                    <button onClick={() => removeFromCart(item.id)} className="text-ivory/20 hover:text-brass/60 transition-colors flex-shrink-0"><X size={14} /></button>
                  </div>
                ))}
              </div>
              {cart.length > 0 && (
                <div className="p-6 border-t border-brass/10">
                  <div className="flex justify-between mb-4">
                    <span className="text-ivory/50 font-tight text-sm">Total</span>
                    <span className="font-display text-2xl text-brass">${cartTotal.toFixed(2)}</span>
                  </div>
                  <a
                    href={`https://wa.me/${(settings.whatsapp_number || '1234567890').replace(/[^+\d]/g, '')}?text=${encodeURIComponent('Hello! I\'d like to order:\n\n' + cart.map(i => `• ${i.title} (x${i.qty}) — $${(i.price * i.qty).toFixed(2)}`).join('\n') + `\n\nTotal: $${cartTotal.toFixed(2)}`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white py-4 font-tight text-sm tracking-widest uppercase hover:bg-[#20BA5A] transition-all"
                  >
                    <MessageCircle size={16} /> Order via WhatsApp
                  </a>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}