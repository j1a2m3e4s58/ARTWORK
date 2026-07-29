export const DEFAULT_STUDIO_OPTIONS = {
  artworkCategories: ['Portrait Painting', 'Sketches', 'Digital Art', 'Pencil Drawings', 'Anime Art', 'Conceptual Art'],
  videoCategories: ['Process', 'Time-lapse', 'Tutorial', 'Behind the Scenes', 'Commission Reveal', 'Other'],
  productTypes: ['Print', 'Framed', 'Digital Download', 'Original'],
};

const cleanList = (value, fallback) => {
  if (!Array.isArray(value)) return [...fallback];
  const unique = [...new Set(value.map(item => String(item).trim()).filter(Boolean))];
  return unique.length ? unique : [...fallback];
};

export function parseStudioOptions(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : value;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_STUDIO_OPTIONS };
    return {
      artworkCategories: cleanList(parsed.artworkCategories, DEFAULT_STUDIO_OPTIONS.artworkCategories),
      videoCategories: cleanList(parsed.videoCategories, DEFAULT_STUDIO_OPTIONS.videoCategories),
      productTypes: cleanList(parsed.productTypes, DEFAULT_STUDIO_OPTIONS.productTypes),
    };
  } catch {
    return { ...DEFAULT_STUDIO_OPTIONS };
  }
}

export function normalizeStudioOptions(options) {
  return {
    artworkCategories: cleanList(options?.artworkCategories, DEFAULT_STUDIO_OPTIONS.artworkCategories),
    videoCategories: cleanList(options?.videoCategories, DEFAULT_STUDIO_OPTIONS.videoCategories),
    productTypes: cleanList(options?.productTypes, DEFAULT_STUDIO_OPTIONS.productTypes),
  };
}
