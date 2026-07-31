import { usePageContent } from '@/hooks/usePageContent';
import PageTransition from '@/components/PageTransition';

const PRIVACY_DEFAULT = `Last updated: July 2026

Information we collect
We collect the account details, messages, commission information, order details and files you intentionally provide. Basic security logs may also be recorded to protect the service.

How information is used
Information is used to operate your account, respond to messages, prepare commissions, fulfil orders, deliver account email and secure the platform. Reigns Atelier does not sell personal information.

Storage and retention
Business records are retained only while needed to provide the service, meet legal obligations and resolve disputes. Uploaded reference material should be removed when it is no longer required.

Your choices
You may download your account data or request account closure from the customer account page. Newsletter messages include an unsubscribe option. You may also request correction of inaccurate information.

Security
Reasonable technical and organisational safeguards are used, but no internet service can guarantee absolute security.

Contact
Use the website contact page for privacy questions or data requests.`;

const TERMS_DEFAULT = `Last updated: July 2026

Using the service
You agree to provide accurate information, protect your account and use the website lawfully.

Commissions
Pricing, scope, revisions, delivery dates, deposits and usage rights are confirmed before commissioned work begins. Displayed estimates are not a final contract.

Orders
An order initiated through WhatsApp is not accepted until the studio confirms availability, pricing, payment and delivery arrangements.

Intellectual property
Unless agreed otherwise in writing, Reigns Atelier retains copyright in original artwork and website content. Purchasing an artwork does not automatically transfer reproduction or commercial-use rights.

Customer materials
You confirm that you have permission to provide reference images and instructions submitted to the studio.

Availability and liability
The service may occasionally be unavailable for maintenance. To the extent permitted by law, liability is limited to the amount paid for the affected service.

Changes
These terms may be updated when the service changes. Continued use after an update means you accept the revised terms.`;

const DELIVERY_DEFAULT = `Last updated: July 2026

Delivery zones and fees
Available delivery zones, fees and estimated delivery times are shown at checkout. If your location is not listed, request a custom delivery quote before payment.

Order processing
Orders are prepared after successful payment or, where offered, after the studio confirms pay-on-delivery eligibility. The studio will notify you if an item is unavailable or a delivery detail needs clarification.

Original artwork and made-to-order work
Original artwork is subject to availability. Commissioned or made-to-order work may have a separate production period before dispatch.

Returns and damage
Contact the studio promptly if an item arrives damaged or incorrect. Do not return artwork without written instructions from the studio. Custom commissions are generally non-refundable once work has begun, except where required by law.

Payment refunds
Eligible refunds are reviewed by the studio and processed using the original payment method where possible.`;

const COMMISSION_DEFAULT = `Last updated: July 2026

Commission process
Submit a request with your preferred artwork type, reference material, budget and deadline. The studio will confirm scope, price, timeline and revision allowance before work starts.

Deposits and payments
A deposit or full payment may be required before work begins. The payment arrangement and balance due date will be agreed in writing for each commission.

Reference material and approvals
You confirm that you have permission to submit reference images. Please review concept or progress updates promptly; substantial changes after approval may require a revised quote.

Copyright and delivery
The artist retains copyright unless commercial or reproduction rights are explicitly agreed in writing. Physical delivery, digital files and framing are only included when listed in the accepted quote.

Cancellation
If you need to cancel, contact the studio as early as possible. Deposit refunds depend on the work already completed and the terms agreed for the commission.`;

export default function LegalPage({ type }) {
  const page = usePageContent('Legal');
  const definitions = {
    privacy: { title: page.privacy_title || 'Privacy Policy', body: page.privacy_body || PRIVACY_DEFAULT },
    terms: { title: page.terms_title || 'Terms of Service', body: page.terms_body || TERMS_DEFAULT },
    delivery: { title: page.delivery_title || 'Delivery & Returns', body: page.delivery_body || DELIVERY_DEFAULT },
    commission: { title: page.commission_policy_title || 'Commission Policy', body: page.commission_policy_body || COMMISSION_DEFAULT },
  };
  const { title, body } = definitions[type] || definitions.terms;
  return (
    <PageTransition>
      <main className="min-h-screen bg-obsidian px-6 pb-24 pt-32">
        <article className="mx-auto max-w-3xl">
          <p className="mb-3 text-xs uppercase tracking-[.3em] text-brass/60">Reigns Atelier</p>
          <h1 className="font-display text-5xl text-ivory">{title}</h1>
          <div className="mt-10 whitespace-pre-wrap border-t border-brass/10 pt-8 text-sm leading-8 text-ivory/60">{body}</div>
        </article>
      </main>
    </PageTransition>
  );
}
