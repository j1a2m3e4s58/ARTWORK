import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import ScrollReveal from '@/components/ScrollReveal';
import SectionLabel from '@/components/SectionLabel';
import PageTransition from '@/components/PageTransition';
import { usePageContent } from '@/hooks/usePageContent';


const STATS = [];

export default function Testimonials() {
  const page = usePageContent('Testimonials');
  const [testimonials, setTestimonials] = useState([]);

  useEffect(() => {
    studioClient.entities.Testimonial.list('-created_date', 50).then(data => {
      setTestimonials(data);
    }).catch(() => {});
  }, []);

  return (
    <PageTransition>
      <div className="min-h-screen bg-obsidian pt-28 pb-24">
        <div className="noise-overlay fixed inset-0 pointer-events-none opacity-30" />

        {/* Header */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-20 text-center">
          <ScrollReveal><SectionLabel>{page.testimonials_label || 'Client Words'}</SectionLabel></ScrollReveal>
          <ScrollReveal delay={0.1}>
            <h1 className="font-display text-5xl md:text-7xl text-ivory mt-2">{page.testimonials_title || 'Voices of Trust'}</h1>
          </ScrollReveal>
          <ScrollReveal delay={0.2}>
            <p className="text-ivory/40 text-lg mt-4 max-w-xl mx-auto">Real words from real collectors and commissioners. Their trust is the foundation of everything I create.</p>
          </ScrollReveal>
        </div>

        {/* Stats */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-20">
          <div className="grid grid-cols-3 gap-4 border-y border-brass/10 py-12">
            {STATS.map((stat, i) => (
              <ScrollReveal key={stat.label} delay={i * 0.1} className="text-center">
                <div className="font-display text-4xl md:text-5xl text-brass">{stat.value}</div>
                <div className="font-tight text-xs uppercase tracking-widest text-ivory/40 mt-1">{stat.label}</div>
              </ScrollReveal>
            ))}
          </div>
        </div>

        {/* Reviews grid */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <ScrollReveal key={t.id || t.clientName} delay={i * 0.1}>
                <div className="glass-panel p-0 overflow-hidden h-full flex flex-col group">
                  {t.artworkImageUrl && (
                    <div className="aspect-[4/3] overflow-hidden relative">
                      <img src={t.artworkImageUrl} alt="" className="w-full h-full object-cover grayscale-[30%] group-hover:grayscale-0 transition-all duration-700 scale-105 group-hover:scale-100" />
                      <div className="absolute inset-0 bg-gradient-to-t from-carbon/60 to-transparent" />
                    </div>
                  )}
                  <div className="p-6 flex-1 flex flex-col">
                    <div className="flex gap-1 mb-4">
                      {Array.from({ length: t.rating || 5 }).map((_, j) => (
                        <Star key={j} size={13} className="fill-brass text-brass" />
                      ))}
                    </div>
                    <blockquote className="text-ivory/60 text-sm leading-relaxed mb-6 flex-1 italic">"{t.review}"</blockquote>
                    <div className="border-t border-brass/10 pt-4">
                      <p className="text-ivory/90 font-tight text-sm">{t.clientName}</p>
                      <div className="flex justify-between items-center mt-1">
                        <p className="text-ivory/30 font-tight text-xs">{t.location}</p>
                        <p className="text-brass/60 font-tight text-xs">{t.artworkType}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="max-w-3xl mx-auto px-6 text-center mt-24 relative">
          <ScrollReveal>
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 50%, #3D2B52 0%, transparent 60%)' }} />
            <h2 className="font-display text-4xl text-ivory mb-4 relative">Ready to become<br /><em className="text-brass">the next story?</em></h2>
            <p className="text-ivory/40 mb-8 relative">Commission your artwork today and join a global family of satisfied collectors.</p>
            <a href="/commission" className="inline-flex items-center gap-2 bg-brass text-obsidian px-10 py-4 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all relative">
              Start Your Commission
            </a>
          </ScrollReveal>
        </div>
      </div>
    </PageTransition>
  );
}
