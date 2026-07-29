export const DEFAULT_COMMISSION_OPTIONS = {
  artworkTypes: ['Portrait Painting', 'Digital Art', 'Sketch', 'Pencil Drawing', 'Anime Art', 'Conceptual Art', 'Other'],
  budgets: ['Under GH₵ 1,000', 'GH₵ 1,000–2,500', 'GH₵ 2,500–5,000', 'GH₵ 5,000–10,000', 'GH₵ 10,000+'],
  referenceUploadEnabled: true,
  referenceUploadLabel: 'Upload reference image (optional)',
  otherArtworkLabel: 'Tell us the artwork type you need',
  otherArtworkPlaceholder: 'For example: mural, leather painting, sculpture, or mixed media',
};

const modernizeArtworkType = value => {
  const option = String(value || '').trim();
  if (option.toLowerCase() === 'portrait') return 'Portrait Painting';
  if (option.toLowerCase() === 'realism') return 'Conceptual Art';
  return option;
};

const cleanList = (value, fallback, transform = item => String(item || '').trim()) => {
  const source = Array.isArray(value) ? value : fallback;
  const cleaned = [...new Set(source.map(transform).filter(Boolean))];
  return cleaned.length ? cleaned : [...fallback];
};

export function normalizeCommissionOptions(options) {
  return {
    artworkTypes: cleanList(options?.artworkTypes, DEFAULT_COMMISSION_OPTIONS.artworkTypes, modernizeArtworkType),
    budgets: cleanList(options?.budgets, DEFAULT_COMMISSION_OPTIONS.budgets),
    referenceUploadEnabled: options?.referenceUploadEnabled !== false,
    referenceUploadLabel: String(options?.referenceUploadLabel || DEFAULT_COMMISSION_OPTIONS.referenceUploadLabel),
    otherArtworkLabel: String(options?.otherArtworkLabel || DEFAULT_COMMISSION_OPTIONS.otherArtworkLabel),
    otherArtworkPlaceholder: String(options?.otherArtworkPlaceholder || DEFAULT_COMMISSION_OPTIONS.otherArtworkPlaceholder),
  };
}

export function parseCommissionOptions(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : value;
    return normalizeCommissionOptions(parsed);
  } catch {
    return { ...DEFAULT_COMMISSION_OPTIONS };
  }
}
