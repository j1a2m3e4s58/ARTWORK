import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSettings } from '@/hooks/useSettings';

const pageNames = {
  '/': 'Fine Art Studio', '/gallery': 'Gallery', '/commission': 'Bespoke Commissions',
  '/shop': 'Art Shop — Originals & Studio Supplies', '/videos': 'Art Films', '/honours': 'Honours & Recognition',
  '/messages': 'Studio Messages', '/about': 'About the Artist',
  '/blog': 'Art Journal', '/contact': 'Contact', '/testimonials': 'Collector Stories',
  '/account': 'My Account', '/admin': 'Studio Administration', '/privacy': 'Privacy Policy',
  '/terms': 'Terms of Service', '/login': 'Sign In', '/register': 'Create Account',
  '/forgot-password': 'Recover Account', '/reset-password': 'Reset Password',
  '/accept-invite': 'Accept Invitation', '/verify-email': 'Verify Email',
};

function setMeta(selector, key, name, value) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(key, name);
    document.head.appendChild(element);
  }
  element.setAttribute('content', value);
}

export default function SiteMetadata() {
  const settings = useSettings();
  const location = useLocation();
  useEffect(() => {
    const brand = settings.site_name || 'Reigns Atelier';
    const pageName = pageNames[location.pathname] || (location.pathname.startsWith('/blog/') ? 'Art Journal' : 'Fine Art Studio');
    const title = location.pathname === '/' && settings.seo_title ? settings.seo_title : `${pageName} | ${brand}`;
    const description = settings.seo_description || 'Bespoke fine art portraits, original works and commissioned artwork crafted with devotion.';
    const baseUrl = (settings.site_url || window.location.origin).replace(/\/$/, '');
    const canonicalUrl = `${baseUrl}${location.pathname}`;
    const privatePage = ['/admin', '/account', '/messages', '/login', '/register', '/forgot-password', '/reset-password', '/accept-invite', '/verify-email'].some(path => location.pathname.startsWith(path));
    document.title = title;
    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[name="robots"]', 'name', 'robots', privatePage ? 'noindex,nofollow' : 'index,follow');
    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    setMeta('meta[property="og:image"]', 'property', 'og:image', `${baseUrl}/og.png`);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', `${baseUrl}/og.png`);
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
    let structuredData = document.getElementById('atelier-structured-data');
    if (!structuredData) {
      structuredData = document.createElement('script');
      structuredData.id = 'atelier-structured-data';
      structuredData.type = 'application/ld+json';
      document.head.appendChild(structuredData);
    }
    structuredData.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'ArtGallery', name: brand, url: baseUrl,
      image: `${baseUrl}/brand/reigns-atelier-logo.jpg`, email: settings.contact_email || undefined,
      sameAs: [settings.instagram_url, settings.twitter_url, settings.youtube_url, settings.tiktok_url, settings.facebook_url, settings.linkedin_url, settings.pinterest_url].filter(Boolean),
    });
  }, [location.pathname, settings]);
  return null;
}
