export const DEFAULT_COMMISSION_PRICES = [
  ['Acrylic & Oil Painting', 'A2', 'Single', 'Unframed', 1500], ['Acrylic & Oil Painting', 'A2', 'Single', 'Framed', 1900], ['Acrylic & Oil Painting', 'A2', 'Double', 'Unframed', 1875], ['Acrylic & Oil Painting', 'A2', 'Double', 'Framed', 2275],
  ['Acrylic & Oil Painting', '18 × 24 in', 'Single', 'Unframed', 1800], ['Acrylic & Oil Painting', '18 × 24 in', 'Single', 'Framed', 2300], ['Acrylic & Oil Painting', '18 × 24 in', 'Double', 'Unframed', 2250], ['Acrylic & Oil Painting', '18 × 24 in', 'Double', 'Framed', 2750],
  ['Acrylic & Oil Painting', '20 × 24 in', 'Single', 'Unframed', 2200], ['Acrylic & Oil Painting', '20 × 24 in', 'Single', 'Framed', 2800], ['Acrylic & Oil Painting', '20 × 24 in', 'Double', 'Unframed', 2750], ['Acrylic & Oil Painting', '20 × 24 in', 'Double', 'Framed', 3350],
  ['Acrylic & Oil Painting', '24 × 30 in', 'Single', 'Unframed', 2500], ['Acrylic & Oil Painting', '24 × 30 in', 'Single', 'Framed', 3200], ['Acrylic & Oil Painting', '24 × 30 in', 'Double', 'Unframed', 3125], ['Acrylic & Oil Painting', '24 × 30 in', 'Double', 'Framed', 3825],
  ['Acrylic & Oil Painting', '28 × 36 in', 'Single', 'Unframed', 3000], ['Acrylic & Oil Painting', '28 × 36 in', 'Single', 'Framed', 3800], ['Acrylic & Oil Painting', '28 × 36 in', 'Double', 'Unframed', 3750], ['Acrylic & Oil Painting', '28 × 36 in', 'Double', 'Framed', 4550],
  ['Acrylic & Oil Painting', '30 × 40 in', 'Single', 'Unframed', 3500], ['Acrylic & Oil Painting', '30 × 40 in', 'Single', 'Framed', 4500], ['Acrylic & Oil Painting', '30 × 40 in', 'Double', 'Unframed', 4375], ['Acrylic & Oil Painting', '30 × 40 in', 'Double', 'Framed', 5375],
  ['Pencil & Charcoal Portrait', 'A3', 'Single', 'Unframed', 450], ['Pencil & Charcoal Portrait', 'A3', 'Single', 'Framed', 700], ['Pencil & Charcoal Portrait', 'A3', 'Double', 'Unframed', 585], ['Pencil & Charcoal Portrait', 'A3', 'Double', 'Framed', 835],
  ['Pencil & Charcoal Portrait', 'A2', 'Single', 'Unframed', 800], ['Pencil & Charcoal Portrait', 'A2', 'Single', 'Framed', 1200], ['Pencil & Charcoal Portrait', 'A2', 'Double', 'Unframed', 1040], ['Pencil & Charcoal Portrait', 'A2', 'Double', 'Framed', 1440],
  ['Pencil & Charcoal Portrait', '18 × 24 in', 'Single', 'Unframed', 1000], ['Pencil & Charcoal Portrait', '18 × 24 in', 'Single', 'Framed', 1500], ['Pencil & Charcoal Portrait', '18 × 24 in', 'Double', 'Unframed', 1300], ['Pencil & Charcoal Portrait', '18 × 24 in', 'Double', 'Framed', 1800],
  ['Pencil & Charcoal Portrait', '24 × 30 in', 'Single', 'Unframed', 1800], ['Pencil & Charcoal Portrait', '24 × 30 in', 'Single', 'Framed', 2500], ['Pencil & Charcoal Portrait', '24 × 30 in', 'Double', 'Unframed', 2340], ['Pencil & Charcoal Portrait', '24 × 30 in', 'Double', 'Framed', 3040],
  ['Pencil & Charcoal Portrait', '30 × 40 in', 'Single', 'Unframed', 3200], ['Pencil & Charcoal Portrait', '30 × 40 in', 'Single', 'Framed', 4200], ['Pencil & Charcoal Portrait', '30 × 40 in', 'Double', 'Unframed', 4160], ['Pencil & Charcoal Portrait', '30 × 40 in', 'Double', 'Framed', 5160],
  ['Pencil Portrait — Single subject', 'A3', 'One person', 'Paper artwork', 800], ['Pencil Portrait — Single subject', 'A2', 'One person', 'Paper artwork', 1200], ['Pencil Portrait — Single subject', '20 × 30 in', 'One person', 'Paper artwork', 1600], ['Pencil Portrait — Single subject', '24 × 30 in', 'One person', 'Paper artwork', 1900], ['Pencil Portrait — Single subject', '30 × 40 in', 'One person', 'Paper artwork', 2500],
  ['Pencil Portrait — Family & group', 'A3', '3 people', 'Paper artwork', 1200], ['Pencil Portrait — Family & group', 'A2', '3 people', 'Paper artwork', 1800], ['Pencil Portrait — Family & group', '20 × 30 in', '3 people', 'Paper artwork', 2000], ['Pencil Portrait — Family & group', '24 × 30 in', '3 people', 'Paper artwork', 2500], ['Pencil Portrait — Family & group', '30 × 40 in', '3 people', 'Paper artwork', 3500, 'GHS 3,500–3,800'],
].map(([category, size, subjects, finish, price, priceNote], index) => ({
  id: `price-${index + 1}`, category, size, subjects, finish, price, priceNote: priceNote || '', previewImageUrl: '', active: true,
}));

export function parseCommissionPrices(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (Array.isArray(parsed) && parsed.length) return parsed.filter(item => item?.active !== false);
  } catch { /* use the studio guide below */ }
  return DEFAULT_COMMISSION_PRICES;
}

export const ghc = value => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', minimumFractionDigits: 0 }).format(Number(value || 0));
