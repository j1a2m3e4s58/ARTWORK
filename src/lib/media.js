export function imageVariant(url, width) {
  const value = String(url || '');
  if (!value || !width) return value;
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.hostname === 'images.pexels.com') {
      parsed.searchParams.set('auto', 'compress');
      parsed.searchParams.set('cs', 'tinysrgb');
      parsed.searchParams.set('w', String(width));
      return parsed.toString();
    }
    if (parsed.hostname.endsWith('res.cloudinary.com') && parsed.pathname.includes('/upload/')) {
      parsed.pathname = parsed.pathname.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`);
      return parsed.toString();
    }
  } catch {
    return value;
  }
  return value;
}

export function imageSrcSet(url, widths = [480, 768, 1200, 1600]) {
  const variants = widths.map(width => imageVariant(url, width));
  if (new Set(variants).size === 1) return undefined;
  return variants.map((variant, index) => `${variant} ${widths[index]}w`).join(', ');
}
