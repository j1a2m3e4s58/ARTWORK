import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Image, ShoppingBag, MessageSquare, BookOpen,
  Users, Plus, Trash2, Pencil, Video, FileText, X, Check, Settings, Star, Download, MoreHorizontal, PackageCheck, Activity, PanelsTopLeft, Library, ArchiveRestore, Truck, Bell, Handshake
} from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import PageTransition from '@/components/PageTransition';
import FileUploadField from '@/components/admin/FileUploadField';
import TestimonialsTab from '@/components/admin/TestimonialsTab';
import SettingsTab from '@/components/admin/SettingsTab';
import AddProductModal from '@/components/admin/AddProductModal';
import AddBlogPostModal from '@/components/admin/AddBlogPostModal';
import BulkImportModal from '@/components/admin/BulkImportModal';
import PagesTab from '@/components/admin/PagesTab';
import QuotesTab from '@/components/admin/QuotesTab';
import InboxTab from '@/components/admin/InboxTab';
import UsersTab from '@/components/admin/UsersTab';
import { useAuth } from '@/lib/AuthContext';
import OrdersTab from '@/components/admin/OrdersTab';
import SystemTab from '@/components/admin/SystemTab';
import HeroSlidesTab from '@/components/admin/HeroSlidesTab';
import MediaLibraryTab from '@/components/admin/MediaLibraryTab';
import RecycleBinTab from '@/components/admin/RecycleBinTab';
import CommissionPackagesTab from '@/components/admin/CommissionPackagesTab';
import CommissionRequestFormTab from '@/components/admin/CommissionRequestFormTab';
import CommissionPricingTab from '@/components/admin/CommissionPricingTab';
import InternshipsTab from '@/components/admin/InternshipsTab';
import CommerceSettingsTab from '@/components/admin/CommerceSettingsTab';
import PriceGuidesTab from '@/components/admin/PriceGuidesTab';
import PartnersTab from '@/components/admin/PartnersTab';
import ResponsiveSelect from '@/components/ResponsiveSelect';
import { DEFAULT_STUDIO_OPTIONS, parseStudioOptions } from '@/lib/studioOptions';

const allTabs = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Dashboard' },
  { id: 'alerts', label: 'Action Alerts', icon: Bell, group: 'Dashboard' },
  { id: 'gallery', label: 'Gallery', icon: Image, group: 'Content' },
  { id: 'banners', label: 'Home Banners', icon: PanelsTopLeft, group: 'Content' },
  { id: 'media', label: 'Media Library', icon: Library, group: 'Content' },
  { id: 'videos', label: 'Art Films', icon: Video, group: 'Content' },
  { id: 'testimonials', label: 'Testimonials', icon: Star, group: 'Content' },
  { id: 'quotes', label: 'Art Quotes', icon: FileText, group: 'Content' },
  { id: 'pages', label: 'Page Content', icon: FileText, group: 'Content' },
  { id: 'blog', label: 'Blog', icon: BookOpen, group: 'Content' },
  { id: 'shop', label: 'Art Shop', icon: ShoppingBag, group: 'Sales' },
  { id: 'price-guides', label: 'Price Guides', icon: FileText, group: 'Sales' },
  { id: 'orders', label: 'Orders', icon: PackageCheck, group: 'Sales' },
  { id: 'commerce', label: 'Delivery & Payments', icon: Truck, group: 'Sales' },
  { id: 'partners', label: 'Partner Marketplace', icon: Handshake, group: 'Sales' },
  { id: 'commissions', label: 'Commissions', icon: MessageSquare, group: 'Sales' },
  { id: 'commission-packages', label: 'Commission Options', icon: PackageCheck, group: 'Sales' },
  { id: 'commission-pricing', label: 'Sizes & Prices', icon: PackageCheck, group: 'Sales' },
  { id: 'commission-form', label: 'Forms & Categories', icon: FileText, group: 'Sales' },
  { id: 'internships', label: 'Internships', icon: Users, group: 'People' },
  { id: 'inbox', label: 'Inbox', icon: MessageSquare, group: 'Communication' },
  { id: 'subscribers', label: 'Subscribers', icon: Users, group: 'Communication' },
  { id: 'users', label: 'People & Access', icon: Users, group: 'People' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'System' },
  { id: 'system', label: 'System Health', icon: Activity, group: 'System' },
  { id: 'recycle', label: 'Recycle Bin', icon: ArchiveRestore, group: 'System' },
];

const tabGroups = ['Dashboard', 'Content', 'Sales', 'Communication', 'People', 'System'];

const STATUS_COLORS = {
  pending: 'text-yellow-400 bg-yellow-400/10',
  reviewing: 'text-brass bg-brass/10',
  accepted: 'text-blue-400 bg-blue-400/10',
  in_progress: 'text-purple-400 bg-purple-400/10',
  completed: 'text-green-400 bg-green-400/10',
  declined: 'text-red-400 bg-red-400/10',
};

const ROLE_TABS = {
  admin: allTabs.map(tab => tab.id),
  editor: ['overview', 'alerts', 'gallery', 'banners', 'media', 'recycle', 'videos', 'shop', 'price-guides', 'testimonials', 'quotes', 'pages', 'blog', 'commission-packages', 'commission-pricing', 'commission-form', 'internships'],
  support: ['overview', 'alerts', 'inbox', 'commissions', 'orders'],
};

function ConfirmDelete({ onConfirm, onCancel }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onConfirm} className="px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-tight hover:bg-red-500/30 transition-colors">Delete</button>
      <button onClick={onCancel} className="px-3 py-1 border border-brass/20 text-ivory/40 text-xs font-tight hover:border-brass/40 transition-colors">Cancel</button>
    </div>
  );
}

function EditModal({ item, fields, onSave, onClose, title }) {
  const [form, setForm] = useState({ ...item });
  return (
    <motion.div className="fixed inset-0 z-[9900] flex items-start justify-center overflow-y-auto overflow-x-hidden p-2 py-4 sm:items-center sm:p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-obsidian/90 backdrop-blur-xl" onClick={onClose} />
      <motion.div role="dialog" aria-modal="true" aria-labelledby="admin-edit-title" className="glass-panel relative z-10 flex w-full max-w-lg min-w-0 flex-col border border-brass/20 p-4 sm:max-h-[calc(100svh-2rem)] sm:overflow-hidden sm:p-7"
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label={`Close ${title}`} className="absolute top-4 right-4 flex h-11 w-11 items-center justify-center text-ivory/30 hover:text-brass transition-colors"><X size={16} /></button>
        <h3 id="admin-edit-title" className="font-display text-2xl text-ivory mb-6">{title}</h3>
        <div className="min-w-0 space-y-3 overflow-x-hidden sm:overflow-y-auto sm:pr-1">
          {fields.map(f => (
            <div key={f.key}>
              {f.type === 'upload' ? (
                <FileUploadField label={f.label} value={form[f.key] || ''}
                  onChange={url => setForm(p => ({ ...p, [f.key]: url }))} accept={f.accept || 'image/*'} />
              ) : f.type === 'textarea' ? (
                <>
                  <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">{f.label}</label>
                  <textarea value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    rows={3} className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 resize-none transition-colors" />
                </>
              ) : f.type === 'select' ? (
                <>
                  <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">{f.label}</label>
                  <ResponsiveSelect label={`Choose ${f.label.toLowerCase()}`} value={form[f.key] || ''} onChange={value => setForm(p => ({ ...p, [f.key]: value }))} options={f.options} />
                </>
              ) : f.type === 'checkbox' ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.checked }))} className="accent-brass" />
                  <span className="text-ivory/60 text-sm">{f.label}</span>
                </label>
              ) : (
                <>
                  <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">{f.label}</label>
                  <input type={f.type || 'text'} value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors" />
                </>
              )}
            </div>
          ))}
        </div>
        <button onClick={() => onSave(form)}
          className="w-full flex items-center justify-center gap-2 bg-brass text-obsidian py-3 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all mt-6">
          <Check size={14} /> Save Changes
        </button>
      </motion.div>
    </motion.div>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = useMemo(() => {
    const permitted = ROLE_TABS[user?.role || 'support'] || ROLE_TABS.support;
    return allTabs.filter(tab => permitted.includes(tab.id));
  }, [user?.role]);
  const requestedSection = searchParams.get('section');
  const initialSection = tabs.some(tab => tab.id === requestedSection) ? requestedSection : 'overview';
  const [activeTab, setActiveTab] = useState(initialSection);
  const [artworks, setArtworks] = useState([]);
  const [videos, setVideos] = useState([]);
  const [products, setProducts] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [subscribers, setSubscribers] = useState([]);
  const [siteContent, setSiteContent] = useState([]);
  const [blogPosts, setBlogPosts] = useState([]);
  const [confirmDel, setConfirmDel] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [editType, setEditType] = useState(null);
  const [showAddVideo, setShowAddVideo] = useState(false);
  const [showAddArtwork, setShowAddArtwork] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddBlog, setShowAddBlog] = useState(false);
  const [bulkImport, setBulkImport] = useState(null); // 'artwork' | 'product' | null
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [recordLimit, setRecordLimit] = useState(50);
  const [studioOptions, setStudioOptions] = useState(DEFAULT_STUDIO_OPTIONS);
  const [newVideo, setNewVideo] = useState({ title: '', videoUrl: '', thumbnailUrl: '', category: DEFAULT_STUDIO_OPTIONS.videoCategories[0], description: '', duration: '', isFeatured: false, status: 'published' });
  const [videoError, setVideoError] = useState('');
  const [newArtwork, setNewArtwork] = useState({ title: '', category: DEFAULT_STUDIO_OPTIONS.artworkCategories[0], imageUrl: '', medium: '', description: '', price: '', status: 'draft' });
  const [notifications, setNotifications] = useState([]);
  const [notificationPermission, setNotificationPermission] = useState(() => typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported');
  const seenAlertIds = useRef(new Set());
  const pendingMessageCount = messages.filter(message => !['replied', 'archived', 'spam'].includes(message.status)).length;
  const actionAlerts = notifications.filter(item => item.userId === user?.id && !item.read).sort((a, b) => String(b.created_date).localeCompare(String(a.created_date)));

  const selectTab = id => {
    if (!tabs.some(tab => tab.id === id)) return;
    if (id !== activeTab) setRecordLimit(50);
    setActiveTab(id);
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      if (id === 'overview') next.delete('section');
      else next.set('section', id);
      return next;
    });
  };

  const openAlert = async alert => {
    try { await studioClient.notifications.markRead(alert.id); } catch { /* the alert is still useful even if the read marker is delayed */ }
    setNotifications(current => current.map(item => item.id === alert.id ? { ...item, read: true } : item));
    selectTab(alert.section || 'overview');
  };

  const enableDesktopAlerts = async () => {
    if (!('Notification' in window)) {
      setTabError('This browser does not support desktop notifications.');
      return;
    }
    const permission = await window.Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission !== 'granted') setTabError('Notification permission was not granted. You can enable it later in your browser site settings.');
  };

  useEffect(() => {
    const nextSection = searchParams.get('section');
    const targetSection = tabs.some(tab => tab.id === nextSection) ? nextSection : 'overview';
    setActiveTab(current => current === targetSection ? current : targetSection);
  }, [searchParams, tabs]);

  useEffect(() => {
    let active = true;
    const loadChoices = () => studioClient.entities.SiteContent
      .filter({ key: 'studio_choice_options', page: 'Settings' })
      .then(records => {
        if (!active) return;
        const latest = [...records].sort((a, b) => (
          new Date(a.updated_date || a.created_date || 0) - new Date(b.updated_date || b.created_date || 0)
        )).at(-1);
        setStudioOptions(parseStudioOptions(latest?.value));
      })
      .catch(() => {});
    loadChoices();
    window.addEventListener('atelier:content-updated', loadChoices);
    return () => {
      active = false;
      window.removeEventListener('atelier:content-updated', loadChoices);
    };
  }, []);

  useEffect(() => {
    setNewArtwork(current => studioOptions.artworkCategories.includes(current.category)
      ? current
      : { ...current, category: studioOptions.artworkCategories[0] || '' });
    setNewVideo(current => studioOptions.videoCategories.includes(current.category)
      ? current
      : { ...current, category: studioOptions.videoCategories[0] || '' });
  }, [studioOptions]);

  useEffect(() => {
    if (user?.role === 'editor') return undefined;
    let active = true;
    const loadMessages = async () => {
      try {
        const items = await studioClient.entities.Message.list('-created_date', 100);
        if (active) setMessages(items);
      } catch (error) {
        console.error('Unable to load admin messages:', error);
      }
    };
    loadMessages();
    const poller = window.setInterval(loadMessages, 30000);
    return () => {
      active = false;
      window.clearInterval(poller);
    };
  }, [user?.role]);

  useEffect(() => {
    let active = true;
    const loadAlerts = async () => {
      try {
        const items = await studioClient.entities.Notification.list('-created_date', 100);
        if (!active) return;
        const mine = items.filter(item => item.userId === user?.id);
        const firstLoad = seenAlertIds.current.size === 0;
        const newUnread = mine.filter(item => !item.read && !seenAlertIds.current.has(item.id));
        mine.forEach(item => seenAlertIds.current.add(item.id));
        setNotifications(mine);
        if (!firstLoad && notificationPermission === 'granted') {
          newUnread.forEach(item => {
            const notification = new window.Notification(`Reigns Atelier — ${item.title}`, {
              body: item.message,
              icon: '/brand/reigns-app-icon-192.png',
              tag: `atelier-action-${item.id}`,
            });
            notification.onclick = () => {
              window.focus();
              openAlert(item);
              notification.close();
            };
          });
        }
      } catch (error) {
        console.error('Unable to load studio action alerts:', error);
      }
    };
    loadAlerts();
    const poller = window.setInterval(loadAlerts, 30000);
    return () => { active = false; window.clearInterval(poller); };
  }, [user?.id, notificationPermission]);

  useEffect(() => {
    let active = true;
    const loaders = {
      overview: async () => {
        const requests = [
          studioClient.entities.Artwork.list('-created_date', 100),
          studioClient.entities.Video.list('-created_date', 100),
        ];
        if (user?.role !== 'editor') requests.push(studioClient.entities.CommissionRequest.list('-created_date', 100));
        if (user?.role === 'admin') requests.push(studioClient.entities.NewsletterSubscriber.list('-created_date', 100));
        const [gallery, videoItems, commissionItems = [], subscriberItems = []] = await Promise.all(requests);
        setArtworks(gallery); setVideos(videoItems); setCommissions(commissionItems); setSubscribers(subscriberItems);
      },
      gallery: () => studioClient.entities.Artwork.list('-created_date', recordLimit).then(setArtworks),
      videos: () => studioClient.entities.Video.list('-created_date', recordLimit).then(setVideos),
      shop: () => studioClient.entities.ShopProduct.list('-created_date', recordLimit).then(setProducts),
      commissions: () => studioClient.entities.CommissionRequest.list('-created_date', recordLimit).then(setCommissions),
      subscribers: () => studioClient.entities.NewsletterSubscriber.list('-created_date', recordLimit).then(setSubscribers),
      blog: () => studioClient.entities.BlogPost.list('-created_date', recordLimit).then(setBlogPosts),
    };
    const loader = loaders[activeTab];
    if (!loader) {
      setTabLoading(false);
      setTabError('');
      return () => {
        active = false;
      };
    }
    setTabLoading(true);
    setTabError('');
    Promise.resolve(loader())
      .catch(error => {
        if (active) setTabError(error.message || 'This section could not be loaded.');
      })
      .finally(() => {
        if (active) setTabLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeTab, user?.role, reloadKey, recordLimit]);

  const pageableCounts = {
    gallery: artworks.length,
    videos: videos.length,
    shop: products.length,
    commissions: commissions.length,
    subscribers: subscribers.length,
    blog: blogPosts.length,
  };

  const handleDelete = async (entity, id, setter) => {
    await studioClient.entities[entity].delete(id);
    setter(prev => prev.filter(i => i.id !== id));
    setConfirmDel(null);
  };

  const handleUpdate = async (entity, id, data, setter) => {
    await studioClient.entities[entity].update(id, data);
    setter(prev => prev.map(i => i.id === id ? { ...i, ...data } : i));
    setEditItem(null); setEditType(null);
  };

  const addVideo = async () => {
    setVideoError('');
    try {
      const v = await studioClient.entities.Video.create(newVideo);
      setVideos(prev => [v, ...prev]);
      setShowAddVideo(false);
      setNewVideo({ title: '', videoUrl: '', thumbnailUrl: '', category: studioOptions.videoCategories[0] || '', description: '', duration: '', isFeatured: false, status: 'published' });
    } catch (error) {
      setVideoError(error.message);
    }
  };

  const addArtwork = async () => {
    const a = await studioClient.entities.Artwork.create(newArtwork);
    setArtworks(prev => [a, ...prev]);
    setShowAddArtwork(false);
    setNewArtwork({ title: '', category: studioOptions.artworkCategories[0] || '', imageUrl: '', medium: '', description: '', price: '', status: 'draft' });
  };

  const addProduct = async (data) => {
    const p = await studioClient.entities.ShopProduct.create(data);
    setProducts(prev => [p, ...prev]);
    setShowAddProduct(false);
  };

  const addBlogPost = async (data) => {
    const post = await studioClient.entities.BlogPost.create(data);
    setBlogPosts(prev => [post, ...prev]);
    setShowAddBlog(false);
  };

  const updateContent = async (id, value) => {
    await studioClient.entities.SiteContent.update(id, { value });
    setSiteContent(prev => prev.map(c => c.id === id ? { ...c, value } : c));
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-obsidian pt-20 flex">
        <div className="noise-overlay fixed inset-0 pointer-events-none opacity-20" />

        {/* Sidebar */}
        <div className="w-60 flex-shrink-0 bg-carbon border-r border-brass/10 pt-8 px-3 hidden md:block fixed top-20 left-0 bottom-0 z-10 overflow-y-auto">
          <div className="mb-6 px-2">
            <p className="font-tight text-[10px] uppercase tracking-[0.3em] text-brass/50">Admin Panel</p>
            <p className="font-display text-lg text-ivory mt-1">Reigns Atelier</p>
          </div>
          {tabGroups.map(group => {
            const groupTabs = tabs.filter(tab => tab.group === group);
            if (!groupTabs.length) return null;
            return (
              <section key={group} className="mb-5" aria-labelledby={`admin-group-${group.toLowerCase()}`}>
                <h2 id={`admin-group-${group.toLowerCase()}`} className="mb-1 px-3 text-[9px] font-semibold uppercase tracking-[0.22em] text-ivory/25">
                  {group}
                </h2>
                {groupTabs.map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => selectTab(id)}
                    aria-current={activeTab === id ? 'page' : undefined}
                    className={`mb-0.5 flex w-full items-center gap-3 px-3 py-2.5 text-left transition-all duration-200 ${
                      activeTab === id ? 'border-l-2 border-brass bg-brass/10 text-brass' : 'text-ivory/40 hover:bg-brass/5 hover:text-ivory/70'
                    }`}>
                    <Icon size={15} />
                    <span className="font-tight text-sm">{label}</span>
                    {(id === 'inbox' && pendingMessageCount > 0) || (id === 'alerts' && actionAlerts.length > 0) ? (
                      <span className="ml-auto min-w-5 rounded-full bg-brass px-1.5 py-0.5 text-center text-[10px] font-semibold text-obsidian">
                        {id === 'alerts' ? actionAlerts.length : pendingMessageCount}
                      </span>
                    ) : null}
                  </button>
                ))}
              </section>
            );
          })}
        </div>

        {/* Mobile bottom bar */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-carbon/95 backdrop-blur-xl border-t border-brass/10 z-50 flex px-2 pb-[max(.4rem,env(safe-area-inset-bottom))]">
          {tabs.filter(tab => ['overview', 'alerts', 'inbox', 'commissions'].includes(tab.id)).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => selectTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors ${activeTab === id ? 'text-brass' : 'text-ivory/30'}`}>
              <Icon size={17} /><span className="text-[9px] font-tight">{label}</span>
              {((id === 'inbox' && pendingMessageCount > 0) || (id === 'alerts' && actionAlerts.length > 0)) && (
                <span className="absolute right-[24%] top-1 min-w-4 rounded-full bg-brass px-1 text-center text-[9px] font-semibold text-obsidian">
                  {id === 'alerts' ? actionAlerts.length : pendingMessageCount}
                </span>
              )}
            </button>
          ))}
          <button onClick={() => setMobileMenuOpen(true)} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-ivory/35">
            <MoreHorizontal size={18} /><span className="text-[9px] font-tight">More</span>
          </button>
        </div>
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div className="fixed inset-0 z-[9000] md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
              <motion.div className="absolute inset-x-3 bottom-3 max-h-[75vh] overflow-y-auto rounded-2xl border border-brass/15 bg-carbon p-4"
                initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}>
                <div className="mb-3 flex items-center justify-between"><p className="font-display text-xl text-ivory">Admin tools</p><button onClick={() => setMobileMenuOpen(false)}><X size={18} /></button></div>
                <div className="space-y-4">
                  {tabGroups.map(group => {
                    const groupTabs = tabs.filter(tab => tab.group === group);
                    if (!groupTabs.length) return null;
                    return (
                      <section key={group}>
                        <h2 className="mb-2 text-[9px] font-semibold uppercase tracking-[0.22em] text-ivory/30">{group}</h2>
                        <div className="grid grid-cols-2 gap-2">
                          {groupTabs.map(({ id, label, icon: Icon }) => (
                            <button key={id} onClick={() => { selectTab(id); setMobileMenuOpen(false); }}
                              aria-current={activeTab === id ? 'page' : undefined}
                              className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm ${activeTab === id ? 'border-brass/30 bg-brass/10 text-brass' : 'border-ivory/5 text-ivory/55'}`}>
                              <Icon size={16} /> {label}
                              {((id === 'inbox' && pendingMessageCount > 0) || (id === 'alerts' && actionAlerts.length > 0)) && (
                                <span className="ml-auto min-w-5 rounded-full bg-brass px-1.5 text-center text-[10px] font-semibold text-obsidian">
                                  {id === 'alerts' ? actionAlerts.length : pendingMessageCount}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        <div className="flex-1 md:ml-60 p-5 lg:p-8 pb-24 md:pb-8">
          {tabLoading && (
            <div className="sticky top-20 z-30 mb-4 h-0.5 overflow-hidden rounded-full bg-brass/10" role="status" aria-label="Loading admin section">
              <motion.div className="h-full w-1/3 bg-brass" animate={{ x: ['-100%', '300%'] }} transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }} />
            </div>
          )}
          {tabError && (
            <div className="mb-5 flex flex-col gap-3 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200 sm:flex-row sm:items-center sm:justify-between" role="alert">
              <span>{tabError}</span>
              <button onClick={() => setReloadKey(value => value + 1)} className="min-h-10 rounded-lg border border-red-300/20 px-4 text-xs font-semibold uppercase tracking-wider hover:bg-red-300/10">Try again</button>
            </div>
          )}

          {/* -- OVERVIEW -- */}
          {activeTab === 'overview' && (
            <div>
              <h1 className="font-display text-4xl text-ivory mb-8">Dashboard</h1>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                {[
                  { label: 'Action alerts', value: actionAlerts.length, color: actionAlerts.length ? 'text-red-300' : 'text-ivory/35', tab: 'alerts' },
                  { label: 'Messages needing reply', value: pendingMessageCount, color: pendingMessageCount ? 'text-brass' : 'text-ivory/35', tab: 'inbox' },
                  { label: 'Artworks', value: artworks.length || '—', color: 'text-brass', tab: 'gallery' },
                  { label: 'Videos', value: videos.length || '—', color: 'text-soft-pink', tab: 'videos' },
                  { label: 'Commissions', value: commissions.length || '—', color: 'text-art-orange', tab: 'commissions' },
                  { label: 'Subscribers', value: subscribers.length || '—', color: 'text-green-400', tab: 'subscribers' },
                ].map(item => (
                  <div key={item.label} className="bg-carbon border border-brass/10 p-6 cursor-pointer hover:border-brass/25 transition-colors"
                    onClick={() => selectTab(item.tab)}>
                    <p className="font-tight text-xs uppercase tracking-widest text-ivory/30 mb-2">{item.label}</p>
                    <p className={`font-display text-4xl ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>
              <section className="mb-6 border border-brass/15 bg-carbon">
                <div className="flex flex-col gap-3 border-b border-brass/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><h2 className="flex items-center gap-2 font-display text-2xl text-ivory"><Bell size={19} className="text-brass" /> Priority action alerts</h2><p className="mt-1 text-xs text-ivory/40">Open an alert to go directly to the customer request.</p></div>
                  {notificationPermission !== 'granted' && <button onClick={enableDesktopAlerts} className="min-h-10 border border-brass/25 px-3 text-xs text-brass hover:border-brass/50">Enable desktop alerts</button>}
                </div>
                {actionAlerts.length ? <div className="divide-y divide-brass/10">{actionAlerts.slice(0, 5).map(alert => <button key={alert.id} onClick={() => openAlert(alert)} className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-brass/5"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${alert.priority === 'high' ? 'bg-red-400' : 'bg-brass'}`} /><span className="min-w-0 flex-1"><span className="block text-sm text-ivory">{alert.title}</span><span className="mt-1 block text-xs text-ivory/45">{alert.message}</span></span><span className="shrink-0 text-[10px] uppercase tracking-widest text-brass">Open</span></button>)}</div> : <p className="p-6 text-sm text-ivory/40">No customer actions need attention right now.</p>}
              </section>
              <div className="bg-carbon border border-brass/10 p-6 text-ivory/50 text-sm leading-relaxed">
                Welcome back. Use the admin navigation to manage artworks, videos, commissions, shop products, testimonials, quotes, messages, users, page content, subscribers, and site settings.
              </div>
            </div>
          )}

          {activeTab === 'alerts' && (
            <div>
              <div className="mb-6 flex items-end justify-between gap-4"><div><h1 className="font-display text-4xl text-ivory">Action Alerts</h1><p className="mt-2 text-sm text-ivory/45">Customer requests and important studio actions, newest first.</p></div>{notificationPermission !== 'granted' && <button onClick={enableDesktopAlerts} className="min-h-10 border border-brass/25 px-3 text-xs text-brass">Enable desktop alerts</button>}</div>
              <div className="space-y-2">{actionAlerts.map(alert => <button key={alert.id} onClick={() => openAlert(alert)} className="flex w-full items-start gap-3 border border-brass/10 bg-carbon p-4 text-left hover:border-brass/30"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${alert.priority === 'high' ? 'bg-red-400' : 'bg-brass'}`} /><span className="min-w-0 flex-1"><span className="block text-sm text-ivory">{alert.title}</span><span className="mt-1 block text-xs text-ivory/45">{alert.message}</span><span className="mt-2 block text-[10px] uppercase tracking-widest text-ivory/30">{new Date(alert.created_date).toLocaleString()}</span></span><span className="text-xs text-brass">Open</span></button>)}{!actionAlerts.length && <p className="border border-brass/10 bg-carbon py-16 text-center text-sm text-ivory/40">No outstanding action alerts.</p>}</div>
            </div>
          )}

          {/* -- AI STUDIO -- */}
{/* -- GALLERY -- */}
          {activeTab === 'gallery' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="font-display text-4xl text-ivory">Gallery</h1>
                <div className="flex gap-2">
                  <button onClick={() => setBulkImport('artwork')}
                    className="flex items-center gap-2 border border-brass/20 text-ivory/50 px-3 py-2 font-tight text-xs tracking-wide hover:border-brass/40 hover:text-brass transition-all">
                    <Download size={13} /> Import CSV
                  </button>
                  <button onClick={() => setShowAddArtwork(true)}
                    className="flex min-h-10 shrink-0 items-center gap-1.5 bg-brass px-3 py-2 font-tight text-xs tracking-wide text-obsidian transition-all hover:bg-brass-light sm:text-sm">
                    <Plus size={14} /> <span className="hidden min-[360px]:inline">Add Artwork</span><span className="min-[360px]:hidden">Add</span>
                  </button>
                </div>
              </div>
              {artworks.length === 0 ? (
                <p className="text-ivory/30 text-sm">No artworks yet. Add some above.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {artworks.map(art => (
                    <div key={art.id} className="bg-carbon border border-brass/10 overflow-hidden group">
                      {art.imageUrl && (
                        <div className="aspect-video overflow-hidden">
                          <img src={art.imageUrl} alt={art.title} className="w-full h-full object-cover grayscale-[20%]" loading="lazy" />
                        </div>
                      )}
                      <div className="p-4">
                        <p className="text-ivory/80 font-tight text-sm truncate">{art.title}</p>
                        <p className="text-brass/60 font-tight text-xs mt-0.5">{art.category}</p>
                        <div className="flex items-center gap-2 mt-3">
                          <button onClick={() => { setEditItem(art); setEditType('artwork'); }}
                            className="flex-1 flex items-center justify-center gap-1 border border-brass/20 text-ivory/50 py-1.5 text-xs font-tight hover:border-brass/50 hover:text-brass transition-colors">
                            <Pencil size={11} /> Edit
                          </button>
                          {confirmDel === art.id ? (
                            <ConfirmDelete onConfirm={() => handleDelete('Artwork', art.id, setArtworks)} onCancel={() => setConfirmDel(null)} />
                          ) : (
                            <button onClick={() => setConfirmDel(art.id)}
                              className="flex items-center justify-center border border-red-500/20 text-red-400/60 px-3 py-1.5 text-xs font-tight hover:border-red-500/40 hover:text-red-400 transition-colors">
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* -- VIDEOS -- */}
          {activeTab === 'videos' && (
            <div>
              <div className="flex items-center justify-between mb-8">
                <h1 className="font-display text-4xl text-ivory">Art Films</h1>
                <button onClick={() => setShowAddVideo(true)}
                  className="flex min-h-10 shrink-0 items-center gap-1.5 bg-brass px-3 py-2 font-tight text-xs tracking-wide text-obsidian transition-all hover:bg-brass-light sm:text-sm">
                  <Plus size={14} /> <span className="hidden min-[360px]:inline">Add Film</span><span className="min-[360px]:hidden">Add</span>
                </button>
              </div>
              {videos.length === 0 ? (
                <p className="text-ivory/30 text-sm">No videos yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {videos.map(v => (
                    <div key={v.id} className="bg-carbon border border-brass/10 overflow-hidden">
                      {v.thumbnailUrl && (
                        <div className="aspect-video overflow-hidden">
                          <img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover grayscale-[20%]" loading="lazy" />
                        </div>
                      )}
                      <div className="p-4">
                        <p className="text-ivory/80 font-tight text-sm">{v.title}</p>
                        <p className="text-brass/60 font-tight text-xs mt-0.5">{v.category} {v.duration && `· ${v.duration}`}</p>
                        <div className="flex items-center gap-2 mt-3">
                          <button onClick={() => { setEditItem(v); setEditType('video'); }}
                            className="flex-1 flex items-center justify-center gap-1 border border-brass/20 text-ivory/50 py-1.5 text-xs font-tight hover:border-brass/50 hover:text-brass transition-colors">
                            <Pencil size={11} /> Edit
                          </button>
                          {confirmDel === v.id ? (
                            <ConfirmDelete onConfirm={() => handleDelete('Video', v.id, setVideos)} onCancel={() => setConfirmDel(null)} />
                          ) : (
                            <button onClick={() => setConfirmDel(v.id)}
                              className="flex items-center justify-center border border-red-500/20 text-red-400/60 px-3 py-1.5 text-xs font-tight hover:border-red-500/40 hover:text-red-400 transition-colors">
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* -- SHOP -- */}
          {activeTab === 'shop' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="font-display text-4xl text-ivory">Shop Products</h1>
                <div className="flex gap-2">
                  <button onClick={() => setBulkImport('product')}
                    className="flex items-center gap-2 border border-brass/20 text-ivory/50 px-3 py-2 font-tight text-xs tracking-wide hover:border-brass/40 hover:text-brass transition-all">
                    <Download size={13} /> Import CSV
                  </button>
                  <button onClick={() => setShowAddProduct(true)}
                    className="flex min-h-10 shrink-0 items-center gap-1.5 bg-brass px-3 py-2 font-tight text-xs tracking-wide text-obsidian transition-all hover:bg-brass-light sm:text-sm">
                    <Plus size={14} /> <span className="hidden min-[360px]:inline">Add Product</span><span className="min-[360px]:hidden">Add</span>
                  </button>
                </div>
              </div>
              {products.length === 0 ? (
                <p className="text-ivory/30 text-sm">No products yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {products.map(p => (
                    <div key={p.id} className="bg-carbon border border-brass/10 overflow-hidden">
                      {p.imageUrl && (
                        <div className="aspect-square overflow-hidden">
                          <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover grayscale-[20%]" loading="lazy" />
                        </div>
                      )}
                      <div className="p-4">
                        <p className="text-ivory/80 font-tight text-sm">{p.title}</p>
                        <p className="text-brass text-sm font-display mt-0.5">GH₵ {Number(p.price || 0).toLocaleString()}</p>
                        <p className="text-ivory/40 font-tight text-xs">{p.type}</p>
                        <div className="flex items-center gap-2 mt-3">
                          <button onClick={() => { setEditItem(p); setEditType('product'); }}
                            className="flex-1 flex items-center justify-center gap-1 border border-brass/20 text-ivory/50 py-1.5 text-xs font-tight hover:border-brass/50 hover:text-brass transition-colors">
                            <Pencil size={11} /> Edit
                          </button>
                          {confirmDel === p.id ? (
                            <ConfirmDelete onConfirm={() => handleDelete('ShopProduct', p.id, setProducts)} onCancel={() => setConfirmDel(null)} />
                          ) : (
                            <button onClick={() => setConfirmDel(p.id)}
                              className="flex items-center justify-center border border-red-500/20 text-red-400/60 px-3 py-1.5 text-xs font-tight hover:border-red-500/40 hover:text-red-400 transition-colors">
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* -- COMMISSIONS -- */}
          {activeTab === 'commissions' && (
            <div>
              <h1 className="font-display text-4xl text-ivory mb-8">Commissions</h1>
              {commissions.length === 0 ? (
                <div className="text-center py-16">
                  <MessageSquare size={32} className="text-brass/20 mx-auto mb-3" />
                  <p className="text-ivory/30 font-tight text-sm">No commission requests yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {commissions.map(c => (
                    <div key={c.id} className="bg-carbon border border-brass/10 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="text-ivory/90 font-tight">{c.name}</p>
                          <p className="text-ivory/40 text-xs">{c.email} {c.phone && `· ${c.phone}`}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-tight text-xs px-2 py-0.5 uppercase tracking-widest ${STATUS_COLORS[c.status] || 'text-ivory/40 bg-ivory/5'}`}>{c.status}</span>
                          <div className="w-40"><ResponsiveSelect label="Choose status" value={c.status} onChange={status => handleUpdate('CommissionRequest', c.id, { status }, setCommissions)} options={['pending','reviewing','accepted','in_progress','completed','declined']} className="text-xs" /></div>
                          {confirmDel === c.id ? (
                            <ConfirmDelete onConfirm={() => handleDelete('CommissionRequest', c.id, setCommissions)} onCancel={() => setConfirmDel(null)} />
                          ) : (
                            <button onClick={() => setConfirmDel(c.id)} className="text-red-400/40 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
                        <div><span className="text-ivory/25 uppercase tracking-widest block mb-0.5">Type</span><span className="text-ivory/60">{c.artworkType}{c.otherArtworkType ? ` — ${c.otherArtworkType}` : ''}</span></div>
                        <div><span className="text-ivory/25 uppercase tracking-widest block mb-0.5">Budget</span><span className="text-ivory/60">{c.budget}</span></div>
                        <div><span className="text-ivory/25 uppercase tracking-widest block mb-0.5">Deadline</span><span className="text-ivory/60">{c.deadline || 'Open'}</span></div>
                        <div><span className="text-ivory/25 uppercase tracking-widest block mb-0.5">Package</span><span className="text-ivory/60">{c.package || 'None'}</span></div>
                      </div>
                      {c.referenceImageUrl && (
                        <div className="mb-3">
                          <span className="text-ivory/25 text-xs uppercase tracking-widest block mb-1">Reference Image</span>
                          <img src={c.referenceImageUrl} alt="Reference" className="h-28 w-auto object-cover border border-brass/10 grayscale-[20%]" />
                        </div>
                      )}
                      {c.description && <p className="text-ivory/40 text-xs border-t border-brass/10 pt-3 line-clamp-3">{c.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* -- TESTIMONIALS -- */}
          {activeTab === 'testimonials' && <TestimonialsTab />}
          {activeTab === 'banners' && <HeroSlidesTab />}
          {activeTab === 'media' && <MediaLibraryTab />}
          {activeTab === 'recycle' && <RecycleBinTab />}
          {activeTab === 'quotes' && <QuotesTab />}
          {activeTab === 'inbox' && <InboxTab messages={messages} setMessages={setMessages} />}
          {activeTab === 'orders' && <OrdersTab />}
          {activeTab === 'commerce' && <CommerceSettingsTab />}
          {activeTab === 'partners' && <PartnersTab />}
          {activeTab === 'price-guides' && <PriceGuidesTab />}
          {activeTab === 'users' && <UsersTab currentUser={user} />}

          {/* -- PAGE CONTENT -- */}
          {activeTab === 'pages' && <PagesTab />}
          {activeTab === 'commission-packages' && <CommissionPackagesTab />}
          {activeTab === 'commission-pricing' && <CommissionPricingTab />}
          {activeTab === 'commission-form' && <CommissionRequestFormTab onStudioOptionsSaved={setStudioOptions} />}
          {activeTab === 'internships' && <InternshipsTab />}

          {/* -- BLOG -- */}
          {activeTab === 'blog' && (
            <div>
              <div className="flex items-center justify-between mb-8">
                <h1 className="font-display text-4xl text-ivory">Blog Posts</h1>
                <button onClick={() => setShowAddBlog(true)}
                  className="flex min-h-10 shrink-0 items-center gap-1.5 bg-brass px-3 py-2 font-tight text-xs tracking-wide text-obsidian transition-all hover:bg-brass-light sm:text-sm">
                  <Plus size={14} /> <span className="hidden min-[360px]:inline">Add Post</span><span className="min-[360px]:hidden">Add</span>
                </button>
              </div>
              {blogPosts.length === 0 ? (
                <p className="text-ivory/30 text-sm">No blog posts yet.</p>
              ) : (
                <div className="space-y-3">
                  {blogPosts.map(post => (
                    <div key={post.id} className="bg-carbon border border-brass/10 p-5 flex items-center gap-4">
                      {post.coverImageUrl && <img src={post.coverImageUrl} alt="" className="w-16 h-16 object-cover flex-shrink-0 grayscale-[30%]" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-ivory/80 font-tight text-sm truncate">{post.title}</p>
                        <p className="text-ivory/30 font-tight text-xs mt-0.5">{post.publishedDate} · {post.readTime} min</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setEditItem(post); setEditType('blog'); }}
                          className="flex items-center gap-1 border border-brass/20 text-ivory/50 px-3 py-1.5 text-xs font-tight hover:border-brass/50 hover:text-brass transition-colors">
                          <Pencil size={11} /> Edit
                        </button>
                        {confirmDel === post.id ? (
                          <ConfirmDelete onConfirm={() => handleDelete('BlogPost', post.id, setBlogPosts)} onCancel={() => setConfirmDel(null)} />
                        ) : (
                          <button onClick={() => setConfirmDel(post.id)} className="text-red-400/40 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* -- SUBSCRIBERS -- */}
          {activeTab === 'subscribers' && (
            <div>
              <h1 className="font-display text-4xl text-ivory mb-8">Subscribers <span className="text-brass/40 text-2xl">({subscribers.length})</span></h1>
              {subscribers.length === 0 ? (
                <div className="text-center py-16">
                  <Users size={32} className="text-brass/20 mx-auto mb-3" />
                  <p className="text-ivory/30 font-tight text-sm">No subscribers yet.</p>
                </div>
              ) : (
                <div className="bg-carbon border border-brass/10 overflow-hidden">
                  <div className="px-5 py-3 border-b border-brass/10 flex justify-between text-ivory/25 font-tight text-xs uppercase tracking-widest">
                    <span>Email</span><span>Date</span>
                  </div>
                  {subscribers.map(s => (
                    <div key={s.id} className="px-5 py-3 border-b border-brass/5 flex justify-between items-center hover:bg-brass/5 transition-colors">
                      <span className="text-ivory/70 text-sm">{s.email}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-ivory/25 text-xs font-tight">{s.subscribedDate}</span>
                        {confirmDel === s.id ? (
                          <ConfirmDelete onConfirm={() => handleDelete('NewsletterSubscriber', s.id, setSubscribers)} onCancel={() => setConfirmDel(null)} />
                        ) : (
                          <button onClick={() => setConfirmDel(s.id)} className="text-red-400/30 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* -- SETTINGS -- */}
          {activeTab === 'settings' && <SettingsTab />}
          {activeTab === 'system' && <SystemTab />}
          {pageableCounts[activeTab] >= recordLimit && (
            <button
              onClick={() => setRecordLimit(limit => Math.min(200, limit + 50))}
              disabled={recordLimit >= 200}
              className="mt-8 min-h-11 w-full border border-brass/25 px-4 text-sm text-brass disabled:cursor-not-allowed disabled:opacity-35"
            >
              {recordLimit >= 200 ? 'Maximum 200 records loaded — use search or exports for larger sets' : 'Load 50 more records'}
            </button>
          )}
        </div>
      </div>

      {/* -- MODALS -- */}
      <AnimatePresence>
        {editItem && editType === 'artwork' && (
          <EditModal item={editItem} title="Edit Artwork" onClose={() => setEditItem(null)}
            onSave={data => handleUpdate('Artwork', editItem.id, data, setArtworks)}
            fields={[
              { key: 'title', label: 'Title' },
              { key: 'category', label: 'Category', type: 'select', options: studioOptions.artworkCategories },
              { key: 'imageUrl', label: 'Image', type: 'upload', accept: 'image/*' },
              { key: 'medium', label: 'Medium' },
              { key: 'dimensions', label: 'Dimensions' },
              { key: 'year', label: 'Year' },
              { key: 'price', label: 'Price (GHS)', type: 'number' },
              { key: 'description', label: 'Description', type: 'textarea' },
              { key: 'isFeatured', label: 'Featured?', type: 'checkbox' },
              { key: 'status', label: 'Publishing status', type: 'select', options: ['draft', 'published', 'archived'] },
              { key: 'scheduledAt', label: 'Publish after', type: 'datetime-local' },
            ]}
          />
        )}
        {editItem && editType === 'video' && (
          <EditModal item={editItem} title="Edit Video" onClose={() => setEditItem(null)}
            onSave={data => handleUpdate('Video', editItem.id, data, setVideos)}
            fields={[
              { key: 'title', label: 'Title' },
              { key: 'category', label: 'Category', type: 'select', options: studioOptions.videoCategories },
              { key: 'videoUrl', label: 'Video File / Embed URL', type: 'upload', accept: 'video/*' },
              { key: 'thumbnailUrl', label: 'Thumbnail Image', type: 'upload', accept: 'image/*' },
              { key: 'duration', label: 'Duration (e.g. 4:30)' },
              { key: 'description', label: 'Description', type: 'textarea' },
              { key: 'isFeatured', label: 'Featured?', type: 'checkbox' },
              { key: 'status', label: 'Publishing status', type: 'select', options: ['draft', 'published', 'archived'] },
              { key: 'scheduledAt', label: 'Publish after', type: 'datetime-local' },
            ]}
          />
        )}
        {editItem && editType === 'product' && (
          <EditModal item={editItem} title="Edit Product" onClose={() => setEditItem(null)}
            onSave={data => handleUpdate('ShopProduct', editItem.id, data, setProducts)}
            fields={[
              { key: 'title', label: 'Title' },
              { key: 'type', label: 'Type', type: 'select', options: studioOptions.productTypes },
              { key: 'imageUrl', label: 'Product Image', type: 'upload', accept: 'image/*' },
              { key: 'price', label: 'Price (GHS)', type: 'number' },
              { key: 'inventory', label: 'Inventory', type: 'number' },
              { key: 'dimensions', label: 'Dimensions' },
              { key: 'description', label: 'Description', type: 'textarea' },
              { key: 'isFeatured', label: 'Featured?', type: 'checkbox' },
              { key: 'status', label: 'Publishing status', type: 'select', options: ['draft', 'published', 'archived'] },
              { key: 'scheduledAt', label: 'Publish after', type: 'datetime-local' },
            ]}
          />
        )}
        {editItem && editType === 'blog' && (
          <EditModal item={editItem} title="Edit Blog Post" onClose={() => setEditItem(null)}
            onSave={data => handleUpdate('BlogPost', editItem.id, data, setBlogPosts)}
            fields={[
              { key: 'title', label: 'Title' },
              { key: 'slug', label: 'Slug (URL)' },
              { key: 'coverImageUrl', label: 'Cover Image', type: 'upload', accept: 'image/*' },
              { key: 'excerpt', label: 'Excerpt', type: 'textarea' },
              { key: 'publishedDate', label: 'Published Date', type: 'date' },
              { key: 'readTime', label: 'Read Time (minutes)', type: 'number' },
              { key: 'content', label: 'Content', type: 'textarea' },
              { key: 'status', label: 'Publishing status', type: 'select', options: ['draft', 'published'] },
            ]}
          />
        )}

        {/* Add Video */}
        {showAddVideo && (
          <motion.div className="fixed inset-0 z-[9900] flex items-start justify-center overflow-y-auto overflow-x-hidden p-2 py-4 sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-obsidian/90 backdrop-blur-xl" onClick={() => setShowAddVideo(false)} />
            <motion.div className="glass-panel relative z-10 flex w-full max-w-lg min-w-0 flex-col border border-brass/20 p-4 sm:max-h-[calc(100svh-2rem)] sm:overflow-hidden sm:p-7"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowAddVideo(false)} className="absolute top-5 right-5 text-ivory/30 hover:text-brass transition-colors"><X size={16} /></button>
              <h3 className="mb-5 pr-12 font-display text-2xl text-ivory">Add Art Film</h3>
              <div className="min-w-0 space-y-3 overflow-x-hidden sm:overflow-y-auto sm:pr-1">
                <div>
                  <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">Title *</label>
                  <input value={newVideo.title} onChange={e => setNewVideo(p => ({ ...p, title: e.target.value }))}
                    className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors" />
                </div>
                <FileUploadField label="Video File / Embed URL *" value={newVideo.videoUrl}
                  onChange={url => setNewVideo(p => ({ ...p, videoUrl: url }))} accept="video/*" placeholder="Paste YouTube/Vimeo URL or upload .mp4" />
                <FileUploadField label="Thumbnail Image" value={newVideo.thumbnailUrl}
                  onChange={url => setNewVideo(p => ({ ...p, thumbnailUrl: url }))} accept="image/*" placeholder="Paste URL or upload image" />
                <div>
                  <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">Duration (e.g. 4:30)</label>
                  <input value={newVideo.duration} onChange={e => setNewVideo(p => ({ ...p, duration: e.target.value }))}
                    className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors" />
                </div>
                <div>
                  <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">Category</label>
                  <ResponsiveSelect label="Choose category" value={newVideo.category} onChange={category => setNewVideo(p => ({ ...p, category }))} options={studioOptions.videoCategories} />
                </div>
                <div>
                  <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">Description</label>
                  <textarea value={newVideo.description} onChange={e => setNewVideo(p => ({ ...p, description: e.target.value }))}
                    rows={2} className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 resize-none transition-colors" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newVideo.isFeatured} onChange={e => setNewVideo(p => ({ ...p, isFeatured: e.target.checked }))} className="accent-brass" />
                  <span className="text-ivory/60 text-sm">Mark as featured</span>
                </label>
                <ResponsiveSelect label="Publishing status" value={newVideo.status} onChange={status => setNewVideo(current => ({ ...current, status }))} options={[{ value: 'draft', label: 'Save as draft' }, { value: 'published', label: 'Publish now' }]} />
              </div>
              {videoError && <p role="alert" className="mt-4 border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-300">{videoError}</p>}
              <button onClick={addVideo} disabled={!newVideo.title || !newVideo.videoUrl}
                className="w-full flex items-center justify-center gap-2 bg-brass text-obsidian py-3 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all mt-6 disabled:opacity-30">
                <Plus size={14} /> Add Art Film
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* Add Artwork */}
        {showAddArtwork && (
          <motion.div className="fixed inset-0 z-[9900] flex items-start justify-center overflow-y-auto overflow-x-hidden p-2 py-4 sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-obsidian/90 backdrop-blur-xl" onClick={() => setShowAddArtwork(false)} />
            <motion.div className="glass-panel relative z-10 flex w-full max-w-lg min-w-0 flex-col border border-brass/20 p-4 sm:max-h-[calc(100svh-2rem)] sm:overflow-hidden sm:p-7"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowAddArtwork(false)} className="absolute top-5 right-5 text-ivory/30 hover:text-brass transition-colors"><X size={16} /></button>
              <h3 className="mb-5 pr-12 font-display text-2xl text-ivory">Add Artwork</h3>
              <div className="min-w-0 space-y-3 overflow-x-hidden sm:overflow-y-auto sm:pr-1">
                {[['Title *', 'title'], ['Medium', 'medium'], ['Dimensions', 'dimensions'], ['Year', 'year'], ['Price (GHS)', 'price']].map(([label, key]) => (
                  <div key={key}>
                    <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">{label}</label>
                    <input value={newArtwork[key] || ''} onChange={e => setNewArtwork(p => ({ ...p, [key]: e.target.value }))}
                      className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors" />
                  </div>
                ))}
                <FileUploadField label="Artwork Image *" value={newArtwork.imageUrl}
                  onChange={url => setNewArtwork(p => ({ ...p, imageUrl: url }))} accept="image/*" placeholder="Paste URL or upload image" />
                <div>
                  <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">Category</label>
                  <ResponsiveSelect label="Choose category" value={newArtwork.category} onChange={category => setNewArtwork(p => ({ ...p, category }))} options={studioOptions.artworkCategories} />
                </div>
                <ResponsiveSelect label="Publishing status" value={newArtwork.status} onChange={status => setNewArtwork(current => ({ ...current, status }))} options={[{ value: 'draft', label: 'Save as draft' }, { value: 'published', label: 'Publish now' }]} />
                <div>
                  <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest block mb-1">Description</label>
                  <textarea value={newArtwork.description} onChange={e => setNewArtwork(p => ({ ...p, description: e.target.value }))}
                    rows={2} className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 resize-none transition-colors" />
                </div>
              </div>
              <button onClick={addArtwork} disabled={!newArtwork.title || !newArtwork.imageUrl}
                className="w-full flex items-center justify-center gap-2 bg-brass text-obsidian py-3 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all mt-6 disabled:opacity-30">
                <Plus size={14} /> Add Artwork
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* Add Product */}
        {showAddProduct && <AddProductModal onAdd={addProduct} onClose={() => setShowAddProduct(false)} productTypes={studioOptions.productTypes} />}

        {/* Add Blog Post */}
        {showAddBlog && <AddBlogPostModal onAdd={addBlogPost} onClose={() => setShowAddBlog(false)} />}

        {/* Bulk Import */}
        {bulkImport && (
          <BulkImportModal
            type={bulkImport}
            onClose={() => setBulkImport(null)}
            onImported={(records) => {
              if (bulkImport === 'artwork') setArtworks(prev => [...records, ...prev]);
              else setProducts(prev => [...records, ...prev]);
              setBulkImport(null);
            }}
          />
        )}
      </AnimatePresence>
    </PageTransition>
  );
}

function ContentEditor({ item, onSave }) {
  const [val, setVal] = useState(item.value);
  const [editing, setEditing] = useState(false);

  return (
    <div className="bg-carbon border border-brass/10 p-5">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-brass/60 font-tight text-xs uppercase tracking-widest">{item.page}</span>
          <span className="text-ivory/30 font-tight text-xs ml-2">· {item.label}</span>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-ivory/30 hover:text-brass text-xs font-tight transition-colors">
            <Pencil size={11} /> Edit
          </button>
        )}
      </div>
      {editing ? (
        <div>
          <textarea value={val} onChange={e => setVal(e.target.value)} rows={3}
            className="w-full bg-obsidian border border-brass/30 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/50 resize-none transition-colors" />
          <div className="flex gap-2 mt-2">
            <button onClick={() => { onSave(val); setEditing(false); }}
              className="flex items-center gap-1 bg-brass text-obsidian px-4 py-1.5 text-xs font-tight tracking-wide hover:bg-brass-light transition-all">
              <Check size={11} /> Save
            </button>
            <button onClick={() => { setVal(item.value); setEditing(false); }}
              className="flex items-center gap-1 border border-brass/20 text-ivory/50 px-4 py-1.5 text-xs font-tight hover:border-brass/40 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-ivory/60 text-sm leading-relaxed line-clamp-3">{val}</p>
      )}
    </div>
  );
}
