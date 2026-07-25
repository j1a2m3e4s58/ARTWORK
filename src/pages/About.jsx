import { motion } from 'framer-motion';
import ScrollReveal from '@/components/ScrollReveal';
import SectionLabel from '@/components/SectionLabel';
import PageTransition from '@/components/PageTransition';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { usePageContent } from '@/hooks/usePageContent';

const parseRows = (value, mapper) => String(value || '')
  .split(/\r?\n/)
  .map(row => row.trim())
  .filter(Boolean)
  .map(row => mapper(row.split('|').map(part => part.trim())))
  .filter(Boolean);

export default function About() {
  const settings = useSettings();
  const page = usePageContent('About');
  const skills = parseRows(page.about_skills, ([name, level]) => {
    const numericLevel = Number.parseInt(level, 10);
    return name && Number.isFinite(numericLevel)
      ? { name, level: Math.min(100, Math.max(0, numericLevel)) }
      : null;
  });
  const timeline = parseRows(page.about_timeline, ([year, event]) => year && event ? { year, event } : null);

  return (
    <PageTransition>
      <div className="min-h-screen bg-obsidian pt-28 pb-24">
        <div className="noise-overlay fixed inset-0 pointer-events-none opacity-30" />

        {/* Hero */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <ScrollReveal><SectionLabel>The Artist</SectionLabel></ScrollReveal>
              <ScrollReveal delay={0.1}>
                <h1 className="font-display text-5xl md:text-7xl text-ivory mt-2 leading-tight">
                  Crafting <em className="text-brass">Stories</em><br />in Graphite & Light
                </h1>
              </ScrollReveal>
              <ScrollReveal delay={0.2}>
                <p className="text-ivory/50 text-lg leading-relaxed mt-6 mb-8">
                  {page.about_bio || 'Use the Admin workspace to add the artist biography.'}
                </p>
              </ScrollReveal>
              <ScrollReveal delay={0.3}>
                <p className="text-ivory/40 text-base leading-relaxed">
                  {page.about_bio2 || ''}
                </p>
              </ScrollReveal>
              <ScrollReveal delay={0.4} className="mt-10">
                <Link to="/commission" className="inline-flex items-center gap-2 bg-brass text-obsidian px-8 py-4 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all duration-300 group">
                  Commission a Piece <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </Link>
              </ScrollReveal>
            </div>
            {/* Photo */}
            <ScrollReveal delay={0.3} direction="left">
              <div className="relative">
                <div className="aspect-[3/4] overflow-hidden">
                  <img
                    src={settings.artist_photo || '/brand/reigns-atelier-logo.jpg'}
                    alt="Artist at work"
                    className="w-full h-full object-cover grayscale-[20%]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-obsidian/60 to-transparent" />
                </div>
                <div className="absolute -bottom-4 -right-4 w-32 h-32 border border-brass/20" />
                <div className="absolute bottom-8 left-8">
                  {page.about_established && <p className="font-tight text-[10px] uppercase tracking-[0.3em] text-brass/70 mb-1">{page.about_established}</p>}
                  <p className="font-display text-xl text-ivory">Reigns Atelier</p>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>

        {/* Mission */}
        <div className="bg-carbon py-24 relative overflow-hidden mb-24">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 30% 50%, #3D2B52 0%, transparent 60%)' }} />
          <div className="noise-overlay absolute inset-0" />
          <div className="max-w-7xl mx-auto px-6 lg:px-12 relative">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
              <ScrollReveal>
                <SectionLabel>Mission</SectionLabel>
                <h2 className="font-display text-4xl text-ivory mt-2 mb-6">Why I Create</h2>
                <p className="text-ivory/50 leading-relaxed">
                  {page.about_mission || 'Art has the power to preserve memory, honor beauty, and give the intangible a home. I create to bridge the gap between what we feel and what we can say — to make the invisible visible through the patient work of the hand and heart.'}
                </p>
              </ScrollReveal>
              <ScrollReveal delay={0.2}>
                <SectionLabel>Inspiration</SectionLabel>
                <h2 className="font-display text-4xl text-ivory mt-2 mb-6">What Moves Me</h2>
                <p className="text-ivory/50 leading-relaxed">
                  {page.about_inspiration || "The quiet drama of the human face. The way light falls across a sleeping figure. The tension in a pencil line that almost breaks. I am endlessly inspired by the masters — Rembrandt's chiaroscuro, Sargent's fluency, Moebius's precision — and by everyday life in all its gorgeous complexity."}
                </p>
              </ScrollReveal>
            </div>
          </div>
        </div>

        {/* Skills */}
        {skills.length > 0 && <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-24">
          <ScrollReveal><SectionLabel>Expertise</SectionLabel></ScrollReveal>
          <ScrollReveal delay={0.1}><h2 className="font-display text-4xl text-ivory mt-2 mb-12">Skills & <em>Mastery</em></h2></ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-8">
            {skills.map((skill, i) => (
              <ScrollReveal key={skill.name} delay={i * 0.08}>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="font-tight text-sm text-ivory/70">{skill.name}</span>
                    <span className="font-tight text-xs text-brass/60">{skill.level}%</span>
                  </div>
                  <div className="h-px bg-brass/10 relative overflow-hidden">
                    <motion.div
                      className="h-full bg-brass absolute left-0"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${skill.level}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.2, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>}

        {/* Timeline */}
        {timeline.length > 0 && <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <ScrollReveal><SectionLabel>Journey</SectionLabel></ScrollReveal>
          <ScrollReveal delay={0.1}><h2 className="font-display text-4xl text-ivory mt-2 mb-16">Artistic <em>Timeline</em></h2></ScrollReveal>
          <div className="relative">
            <div className="absolute left-0 md:left-1/2 top-0 bottom-0 w-px bg-brass/15 -translate-x-1/2 hidden md:block" />
            <div className="space-y-12">
              {timeline.map((item, i) => (
                <ScrollReveal key={item.year + i} delay={i * 0.1}>
                  <div className={`flex flex-col md:flex-row gap-6 md:gap-16 ${i % 2 === 0 ? 'md:flex-row-reverse' : ''}`}>
                    <div className="flex-1 md:text-right">
                      {i % 2 === 0 ? (
                        <div>
                          <span className="font-display text-5xl text-brass/20">{item.year}</span>
                          <p className="text-ivory/60 text-sm leading-relaxed mt-1 max-w-sm ml-auto">{item.event}</p>
                        </div>
                      ) : <div className="hidden md:block" />}
                    </div>
                    <div className="hidden md:flex items-start justify-center w-4">
                      <div className="w-3 h-3 border border-brass/50 rotate-45 bg-obsidian mt-4" />
                    </div>
                    <div className="flex-1">
                      {i % 2 !== 0 ? (
                        <div>
                          <span className="font-display text-5xl text-brass/20">{item.year}</span>
                          <p className="text-ivory/60 text-sm leading-relaxed mt-1 max-w-sm">{item.event}</p>
                        </div>
                      ) : <div className="hidden md:block" />}
                    </div>
                    {/* Mobile */}
                    <div className="md:hidden">
                      <span className="font-display text-4xl text-brass/30">{item.year}</span>
                      <p className="text-ivory/60 text-sm leading-relaxed mt-1">{item.event}</p>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </div>}
      </div>
    </PageTransition>
  );
}
