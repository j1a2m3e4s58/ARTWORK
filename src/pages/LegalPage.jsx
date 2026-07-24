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

export default function LegalPage({ type }) {
  const page = usePageContent('Legal');
  const privacy = type === 'privacy';
  const title = privacy ? (page.privacy_title || 'Privacy Policy') : (page.terms_title || 'Terms of Service');
  const body = privacy
    ? (page.privacy_body || PRIVACY_DEFAULT)
    : (page.terms_body || TERMS_DEFAULT);
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
