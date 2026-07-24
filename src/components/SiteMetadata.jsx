import { useEffect } from 'react';
import { useSettings } from '@/hooks/useSettings';

export default function SiteMetadata() {
  const settings = useSettings();
  useEffect(() => {
    if (settings.seo_title) document.title = settings.seo_title;
    const description = document.querySelector('meta[name="description"]');
    if (description && settings.seo_description) description.setAttribute('content', settings.seo_description);
  }, [settings.seo_title, settings.seo_description]);
  return null;
}
