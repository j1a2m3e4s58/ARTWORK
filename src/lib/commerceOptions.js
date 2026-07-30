export const DEFAULT_COMMERCE_OPTIONS = {
  storeName: 'Art Shop',
  storeSubtitle: 'Original artworks, prints, studio tools, and carefully selected art supplies.',
  currency: 'GHS',
  deliveryZones: [
    { id: 'accra', name: 'Accra', fee: 25, eta: '1–3 working days', active: true },
    { id: 'tema', name: 'Tema', fee: 30, eta: '1–3 working days', active: true },
    { id: 'kasoa', name: 'Kasoa', fee: 35, eta: '2–4 working days', active: true },
    { id: 'other-ghana', name: 'Other Ghana locations', fee: 50, eta: 'Arranged after confirmation', active: true },
  ],
  paymentMethods: {
    paystack: true,
    mobile_money: true,
    bank_transfer: true,
    pay_on_delivery: true,
  },
  whatsapp: {
    number: '',
    orderMessage: [
      'Hello {studioName}, I have placed an order.',
      'Order: {trackingCode}',
      '{items}',
      'Delivery: {deliveryZone}',
      'Address: {deliveryAddress}',
      'Payment: {paymentMethod}',
      'Subtotal: {subtotal}',
      'Delivery fee: {deliveryFee}',
      'Total: {total}',
      'Customer: {customerName} ({customerPhone})',
      '{customerNote}',
      'Please confirm the order and next steps.',
    ].join('\n'),
  },
  mobileMoney: {
    network: 'MTN MoMo',
    number: '',
    accountName: '',
    instructions: 'Use your order reference as the payment reference, then upload a clear screenshot.',
  },
  bankTransfer: {
    bankName: '',
    accountName: '',
    accountNumber: '',
    branch: '',
    instructions: 'The studio will confirm the transfer before dispatch.',
  },

  payOnDeliveryNote: 'Pay on delivery is subject to confirmation for the selected location and order value.',
  checkoutNote: 'Your order is recorded securely. The studio will confirm availability, delivery, and payment on WhatsApp.',
};

const cleanZone = (zone, index) => ({
  id: String(zone?.id || `zone-${index + 1}`).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-') || `zone-${index + 1}`,
  name: String(zone?.name || '').trim(),
  fee: Math.max(0, Number(zone?.fee) || 0),
  eta: String(zone?.eta || '').trim(),
  active: zone?.active !== false,
});

export function parseCommerceOptions(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_COMMERCE_OPTIONS;
    return {
      ...DEFAULT_COMMERCE_OPTIONS,
      ...parsed,
      paymentMethods: { ...DEFAULT_COMMERCE_OPTIONS.paymentMethods, ...(parsed.paymentMethods || {}) },
      whatsapp: { ...DEFAULT_COMMERCE_OPTIONS.whatsapp, ...(parsed.whatsapp || {}) },
      mobileMoney: { ...DEFAULT_COMMERCE_OPTIONS.mobileMoney, ...(parsed.mobileMoney || {}) },
      bankTransfer: { ...DEFAULT_COMMERCE_OPTIONS.bankTransfer, ...(parsed.bankTransfer || {}) },
      deliveryZones: Array.isArray(parsed.deliveryZones)
        ? parsed.deliveryZones.map(cleanZone).filter(zone => zone.name)
        : DEFAULT_COMMERCE_OPTIONS.deliveryZones,
    };
  } catch {
    return DEFAULT_COMMERCE_OPTIONS;
  }
}

export const serializeCommerceOptions = options => JSON.stringify(parseCommerceOptions(options));


export const paymentMethodLabel = method => ({
  mobile_money: 'Mobile Money',
  bank_transfer: 'Bank Transfer',
  pay_on_delivery: 'Pay on Delivery',
  paystack: 'Secure Online Payment',
}[method] || method);

export function renderWhatsAppOrderMessage(template, values) {
  const source = String(template || DEFAULT_COMMERCE_OPTIONS.whatsapp.orderMessage);
  return source
    .replace(/\{([a-zA-Z]+)\}/g, (match, key) => (
      Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? '') : match
    ))
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim())
    .join('\n');
}
