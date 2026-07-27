import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, ChevronDown, Upload, Sparkles, Loader2 } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import ScrollReveal from '@/components/ScrollReveal';
import SectionLabel from '@/components/SectionLabel';
import PageTransition from '@/components/PageTransition';
import { useSettings } from '@/hooks/useSettings';
import { usePageContent } from '@/hooks/usePageContent';
import CommissionBriefBuilder from '@/components/CommissionBriefBuilder';
import CommissionGuideChat from '@/components/CommissionGuideChat';
import { useAuth } from '@/lib/AuthContext';
import { Link } from 'react-router-dom';

const DEFAULT_PACKAGES = [
  { name: 'Sketch Study', price: 'GH₵ 800', duration: '5-7 days', features: ['One subject', 'Pencil / Charcoal', 'Digital delivery', '1 revision', 'A4 size'] },
  { name: 'Fine Portrait', price: 'GH₵ 2,000', duration: '10-14 days', features: ['One subject', 'Choice of medium', 'High-res digital + print', '3 revisions', 'A3 size', 'Certificate of authenticity'], featured: true },
  { name: 'Masterwork', price: 'GH₵ 4,500+', duration: '3-5 weeks', features: ['Multiple subjects', 'Premium medium', 'Original shipped worldwide', 'Unlimited revisions', 'Custom size', 'Certificate + framing'] },
];

const DEFAULT_FAQS = [
  { q: 'How does the commission process work?', a: 'You submit your request, I review it within 24 hours, and if accepted, we discuss details. You get progress previews and final delivery once satisfied.' },
  { q: 'What reference images do you need?', a: 'Clear, well-lit photos work best. The more reference angles you provide, the more accurate and detailed the final artwork will be.' },
  { q: 'Do you offer revisions?', a: 'Yes — revisions are included based on your package. The Fine Portrait and Masterwork packages include multiple rounds of feedback.' },
  { q: 'How do I pay?', a: 'A 50% deposit is required to begin. The remaining 50% is due upon your approval of the final artwork before delivery.' },
];

const ARTWORK_TYPES = ['Portrait', 'Digital Art', 'Sketch', 'Pencil Drawing', 'Anime Art', 'Realism', 'Other'];
const BUDGETS = ['Under GH₵ 1,000', 'GH₵ 1,000–2,500', 'GH₵ 2,500–5,000', 'GH₵ 5,000–10,000', 'GH₵ 10,000+'];

export default function Commission() {
  const settings = useSettings();
  const { user } = useAuth();
  const page = usePageContent('Commission');
  const legacyPackages = [1, 2, 3].map((number, index) => ({
    name: page[`commission_pkg${number}_name`] || DEFAULT_PACKAGES[index].name,
    price: page[`commission_pkg${number}_price`] || DEFAULT_PACKAGES[index].price,
    duration: page[`commission_pkg${number}_duration`] || DEFAULT_PACKAGES[index].duration,
    features: String(page[`commission_pkg${number}_features`] || DEFAULT_PACKAGES[index].features.join(','))
      .split(',').map(feature => feature.trim()).filter(Boolean),
    featured: number === 2,
  }));
  let packages = legacyPackages;
  try {
    const managedPackages = JSON.parse(page.commission_packages || '');
    if (Array.isArray(managedPackages) && managedPackages.length) {
      packages = managedPackages
        .filter(pkg => pkg?.active !== false)
        .map((pkg, index) => ({
          name: String(pkg.name || `Package ${index + 1}`),
          price: String(pkg.price || ''),
          duration: String(pkg.duration || ''),
          features: Array.isArray(pkg.features) ? pkg.features.map(feature => String(feature).trim()).filter(Boolean) : [],
          featured: Boolean(pkg.featured),
        }));
    }
  } catch { /* Continue using the existing three packages until the new manager is saved. */ }
  const faqs = [1, 2, 3, 4].map((number, index) => ({
    q: page[`commission_faq${number}_q`] || DEFAULT_FAQS[index].q,
    a: page[`commission_faq${number}_a`] || DEFAULT_FAQS[index].a,
  })).filter(faq => faq.q && faq.a);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: user?.full_name || '', email: user?.email || '', phone: '', artworkType: '', budget: '', deadline: '', description: '', package: '', referenceImageUrl: '' });
  const [submitted, setSubmitted] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const { file_url } = await studioClient.integrations.Core.UploadFile({ file });
      set('referenceImageUrl', file_url);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      window.location.assign('/login?redirect=/commission');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await studioClient.entities.CommissionRequest.create({ ...form });
      setSubmitted(true);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-obsidian flex items-center justify-center px-6">
          <motion.div
            className="text-center max-w-lg"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.div
              className="w-20 h-20 border border-brass/30 flex items-center justify-center mx-auto mb-8"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <Sparkles className="text-brass" size={32} />
            </motion.div>
            <h2 className="font-display text-4xl text-ivory mb-4">Request Received</h2>
            <p className="text-ivory/50 text-lg leading-relaxed mb-8">
              Thank you, {form.name}. Your commission request has been received. I will review it and respond within 24 hours with next steps.
            </p>
            <div className="flex flex-col gap-3">
              {settings.whatsapp_number ? <a href={`https://wa.me/${settings.whatsapp_number.replace(/[^\d]/g, '')}?text=Hello, I just submitted a commission request as ${encodeURIComponent(form.name)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-[#25D366] text-white py-3 font-tight text-sm tracking-wide hover:bg-[#20BA5A] transition-colors"
              >
                Follow up on WhatsApp
              </a> : <Link to="/contact" className="flex items-center justify-center gap-2 border border-brass/30 text-brass py-3 font-tight text-sm tracking-wide hover:border-brass transition-colors">
                Contact the studio
              </Link>}
              <button onClick={() => { setSubmitted(false); setForm({ name: user?.full_name || '', email: user?.email || '', phone: '', artworkType: '', budget: '', deadline: '', description: '', package: '', referenceImageUrl: '' }); setStep(1); }}
                className="border border-brass/20 text-ivory/60 py-3 font-tight text-sm tracking-wide hover:border-brass/40 transition-colors"
              >
                Submit another request
              </button>
            </div>
          </motion.div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-obsidian pt-28 pb-24">
        <div className="noise-overlay fixed inset-0 pointer-events-none opacity-30" />

        {/* Hero */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-20">
          <ScrollReveal><SectionLabel>Commission Suite</SectionLabel></ScrollReveal>
          <ScrollReveal delay={0.1}>
            <h1 className="font-display text-5xl md:text-7xl text-ivory mt-2">
              {page.commission_hero_title || 'Your Vision,'}<br /><em className="text-brass">{page.commission_hero_title2 || 'My Craft'}</em>
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={0.2}>
            <p className="text-ivory/40 text-lg mt-4 max-w-xl leading-relaxed">
              {page.commission_tagline || settings.commission_tagline || 'Commission a bespoke artwork crafted entirely for you. From intimate pencil portraits to large-scale digital masterpieces.'}
            </p>
          </ScrollReveal>
        </div>

        {/* Packages */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-24">
          <ScrollReveal><SectionLabel>Packages</SectionLabel></ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            {packages.map((pkg, i) => (
              <ScrollReveal key={pkg.name} delay={i * 0.1}>
                <div
                  className={`relative p-8 border cursor-pointer transition-all duration-300 ${
                    form.package === pkg.name
                      ? 'border-brass bg-brass/5'
                      : pkg.featured
                      ? 'border-brass/40 bg-carbon'
                      : 'border-brass/10 hover:border-brass/30'
                  }`}
                  onClick={() => set('package', pkg.name)}
                >
                  {pkg.featured && (
                    <div className="absolute -top-3 left-6 bg-brass text-obsidian font-tight text-xs px-3 py-1 tracking-widest uppercase">
                      Most Popular
                    </div>
                  )}
                  {form.package === pkg.name && (
                    <div className="absolute top-4 right-4 w-6 h-6 bg-brass flex items-center justify-center">
                      <Check size={12} className="text-obsidian" />
                    </div>
                  )}
                  <h3 className="font-display text-2xl text-ivory mb-1">{pkg.name}</h3>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-brass text-3xl font-display">{pkg.price}</span>
                  </div>
                  <p className="text-ivory/30 font-tight text-xs tracking-wide mb-6">{pkg.duration}</p>
                  <div className="space-y-2.5">
                    {(pkg.features || []).map(f => (
                      <div key={f} className="flex items-center gap-2">
                        <div className="w-3 h-px bg-brass/60" />
                        <span className="text-ivory/60 text-sm">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>

        {/* Form */}
        <div className="max-w-3xl mx-auto px-6 lg:px-12 mb-24">
          <ScrollReveal>
            <div className="glass-panel p-10">
              <h2 className="font-display text-3xl text-ivory mb-2">{page.commission_form_title || 'Commission Request'}</h2>
              <p className="text-ivory/40 text-sm mb-8">{page.commission_form_subtitle || 'Fill in the details below to begin our collaboration.'}</p>
              {error && <p role="alert" className="mb-5 border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}

              <div className="flex gap-2 mb-10">
                {[1, 2, 3].map(s => (
                  <div key={s} className={`h-px flex-1 transition-all duration-500 ${step >= s ? 'bg-brass' : 'bg-brass/15'}`} />
                ))}
              </div>

              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                    <p className="text-ivory/50 text-sm mb-6">Step 1 of 3 — Your details</p>
                    <label htmlFor="commission-name" className="sr-only">Your full name</label>
                    <input id="commission-name" name="name" autoComplete="name" placeholder="Your full name *" value={form.name} onChange={e => set('name', e.target.value)}
                      className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-5 py-3.5 placeholder:text-ivory/25 focus:outline-none focus:border-brass/50 transition-colors text-sm" />
                    <label htmlFor="commission-email" className="sr-only">Account email</label>
                    <input id="commission-email" name="email" type="email" value={form.email} readOnly
                      className="w-full bg-obsidian border border-brass/20 text-ivory/50 px-5 py-3.5 text-sm" />
                    <label htmlFor="commission-phone" className="sr-only">Phone or WhatsApp number</label>
                    <input id="commission-phone" name="phone" autoComplete="tel" type="tel" placeholder="Phone / WhatsApp (optional)" value={form.phone} onChange={e => set('phone', e.target.value)}
                      className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-5 py-3.5 placeholder:text-ivory/25 focus:outline-none focus:border-brass/50 transition-colors text-sm" />
                    <button onClick={() => setStep(2)} disabled={!form.name || !form.email}
                      className="w-full flex items-center justify-center gap-2 bg-brass text-obsidian py-4 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed mt-4">
                      Continue <ArrowRight size={16} />
                    </button>
                  </motion.div>
                )}
                {step === 2 && (
                  <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                    <p className="text-ivory/50 text-sm mb-6">Step 2 of 3 — Artwork details</p>
                    <fieldset className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2">
                      <legend className="sr-only">Artwork type</legend>
                      {ARTWORK_TYPES.map(type => (
                        <button key={type} onClick={() => set('artworkType', type)}
                          className={`py-3 px-4 border text-sm font-tight tracking-wide text-left transition-all duration-200 ${
                            form.artworkType === type ? 'border-brass bg-brass/10 text-brass' : 'border-brass/15 text-ivory/50 hover:border-brass/30'
                          }`}>
                          {type}
                        </button>
                      ))}
                    </fieldset>
                    <fieldset className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2 mt-2">
                      <legend className="sr-only">Budget</legend>
                      {BUDGETS.map(b => (
                        <button key={b} onClick={() => set('budget', b)}
                          className={`py-3 px-4 border text-sm font-tight tracking-wide transition-all duration-200 ${
                            form.budget === b ? 'border-brass bg-brass/10 text-brass' : 'border-brass/15 text-ivory/50 hover:border-brass/30'
                          }`}>
                          {b}
                        </button>
                      ))}
                    </fieldset>
                    <label htmlFor="commission-deadline" className="sr-only">Preferred deadline</label>
                    <input id="commission-deadline" name="deadline" type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)}
                      className="w-full bg-obsidian border border-brass/20 text-ivory/60 px-5 py-3.5 focus:outline-none focus:border-brass/50 transition-colors text-sm" />
                    <div className="flex gap-3 mt-4">
                      <button onClick={() => setStep(1)} className="flex-1 border border-brass/20 text-ivory/50 py-4 font-tight text-sm tracking-widest uppercase hover:border-brass/40 transition-all">Back</button>
                      <button onClick={() => setStep(3)} disabled={!form.artworkType || !form.budget}
                        className="flex-1 flex items-center justify-center gap-2 bg-brass text-obsidian py-4 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                        Continue <ArrowRight size={16} />
                      </button>
                    </div>
                  </motion.div>
                )}
                {step === 3 && (
                  <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                    <p className="text-ivory/50 text-sm mb-6">Step 3 of 3 — Your vision</p>
                    <CommissionBriefBuilder form={form} set={set} />
                    <label htmlFor="commission-description" className="sr-only">Describe your vision</label>
                    <textarea id="commission-description" name="description"
                      placeholder="Describe your vision in detail. What emotions should the artwork evoke? Any specific elements, colors, or references? *"
                      value={form.description}
                      onChange={e => set('description', e.target.value)}
                      rows={6}
                      className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-5 py-3.5 placeholder:text-ivory/25 focus:outline-none focus:border-brass/50 transition-colors text-sm resize-none"
                    />
                    <label htmlFor="commission-reference" className="sr-only">Reference image</label>
                    <input id="commission-reference" name="referenceImage" ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                    <div
                      className="border border-dashed border-brass/20 p-6 text-center hover:border-brass/40 transition-colors cursor-pointer relative"
                      onClick={() => !uploading && fileInputRef.current?.click()}
                    >
                      {uploading ? (
                        <Loader2 size={20} className="text-brass/60 mx-auto mb-2 animate-spin" />
                      ) : form.referenceImageUrl ? (
                        <img src={form.referenceImageUrl} alt="Reference" className="h-24 mx-auto object-cover mb-2 border border-brass/20" />
                      ) : (
                        <Upload size={20} className="text-brass/40 mx-auto mb-2" />
                      )}
                      <p className="text-ivory/30 text-xs font-tight tracking-wide">
                        {form.referenceImageUrl ? 'Image uploaded ✓ (click to change)' : 'Upload reference image (optional)'}
                      </p>
                      {!form.referenceImageUrl && <p className="text-ivory/20 text-xs mt-1">JPG, PNG up to 10MB</p>}
                    </div>
                    <div className="flex gap-3 mt-4">
                      <button onClick={() => setStep(2)} className="flex-1 border border-brass/20 text-ivory/50 py-4 font-tight text-sm tracking-widest uppercase hover:border-brass/40 transition-all">Back</button>
                      <button onClick={handleSubmit} disabled={!form.description || submitting}
                        className="flex-1 flex items-center justify-center gap-2 bg-brass text-obsidian py-4 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                        {submitting ? 'Submitting…' : 'Submit Request'} <Sparkles size={16} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </ScrollReveal>
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto px-6 lg:px-12">
          <ScrollReveal><SectionLabel>FAQ</SectionLabel></ScrollReveal>
          <ScrollReveal delay={0.1}><h2 className="font-display text-4xl text-ivory mb-10 mt-2">Common <em>Questions</em></h2></ScrollReveal>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <ScrollReveal key={i} delay={i * 0.05}>
                <div className="border border-brass/10 overflow-hidden">
                  <button
                    aria-expanded={openFaq === i}
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-6 text-left hover:bg-brass/3 transition-colors"
                  >
                    <span className="text-ivory/80 font-tight text-sm">{faq.q}</span>
                    <ChevronDown size={16} className={`text-brass/60 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {openFaq === i && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <p className="px-6 pb-6 text-ivory/50 text-sm leading-relaxed">{faq.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
        <CommissionGuideChat />
      </div>
    </PageTransition>
  );
}
