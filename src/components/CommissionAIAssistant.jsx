import { useState } from 'react';
import { Sparkles, Loader2, X, Lightbulb, DollarSign, Clock } from 'lucide-react';
import { analyzeCommissionVision, suggestPrice } from '@/lib/aiHelpers';

export default function CommissionAIAssistant({ form, set, settings }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [vision, setVision] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [pricingLoading, setPricingLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!form.description) return;
    setLoading(true);
    setVision(null);
    try {
      const res = await analyzeCommissionVision(form.description, form.referenceImageUrl);
      setVision(res);
    } catch (e) {
      setVision({ error: 'Analysis failed. Try again.' });
    }
    setLoading(false);
  };

  const handleApplyVision = () => {
    if (!vision || vision.error) return;
    if (vision.artworkType) set('artworkType', vision.artworkType);
    if (vision.suggestedPackage) set('package', vision.suggestedPackage);
    setOpen(false);
  };

  const handlePricing = async () => {
    setPricingLoading(true);
    setPricing(null);
    try {
      const res = await suggestPrice({
        artworkType: form.artworkType || vision?.artworkType || 'Portrait',
        complexity: 3,
      });
      setPricing(res);
    } catch (e) {
      setPricing({ error: 'Pricing failed. Try again.' });
    }
    setPricingLoading(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 border border-brass/30 bg-violet/10 text-brass py-3 font-tight text-sm tracking-wide hover:bg-violet/20 hover:border-brass/50 transition-all"
      >
        <Sparkles size={16} /> AI Vision Assistant
      </button>

      {open && (
        <div className="fixed inset-0 z-[9900] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-obsidian/90 backdrop-blur-xl" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-lg glass-panel border border-brass/20 max-h-[85vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-brass" size={20} />
                  <h3 className="font-display text-2xl text-ivory">AI Vision Assistant</h3>
                </div>
                <button onClick={() => setOpen(false)} className="text-ivory/30 hover:text-brass transition-colors"><X size={16} /></button>
              </div>
              <p className="text-ivory/40 text-sm mb-5">Describe your vision and let AI suggest the right artwork type, package, and pricing.</p>

              <textarea
                placeholder="Describe what you envision... e.g. 'A moody charcoal portrait of my grandmother, soft lighting, nostalgic feeling'"
                value={form.description}
                onChange={e => set('description', e.target.value)}
                rows={3}
                className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-3 text-sm focus:outline-none focus:border-brass/40 transition-colors resize-none mb-3"
              />

              <button onClick={handleAnalyze} disabled={!form.description || loading}
                className="w-full flex items-center justify-center gap-2 bg-brass text-obsidian py-3 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all disabled:opacity-30 mb-4">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Analyze My Vision
              </button>

              {vision && !vision.error && (
                <div className="space-y-4 border border-brass/15 p-4 bg-obsidian/50">
                  <div>
                    <p className="text-brass/60 text-[10px] uppercase tracking-widest mb-1">Vision Summary</p>
                    <p className="text-ivory/80 text-sm italic">{vision.visionSummary}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-carbon p-3 border border-brass/10">
                      <p className="text-ivory/25 text-[10px] uppercase tracking-widest mb-1">Suggested Type</p>
                      <p className="text-brass text-sm font-tight">{vision.artworkType}</p>
                    </div>
                    <div className="bg-carbon p-3 border border-brass/10">
                      <p className="text-ivory/25 text-[10px] uppercase tracking-widest mb-1">Package</p>
                      <p className="text-brass text-sm font-tight">{vision.suggestedPackage}</p>
                    </div>
                    <div className="bg-carbon p-3 border border-brass/10">
                      <DollarSign size={12} className="text-brass/50 inline mr-1" />
                      <span className="text-ivory/70 text-sm">{vision.estimatedPrice}</span>
                    </div>
                    <div className="bg-carbon p-3 border border-brass/10">
                      <Clock size={12} className="text-brass/50 inline mr-1" />
                      <span className="text-ivory/70 text-sm">{vision.estimatedTimeline}</span>
                    </div>
                  </div>
                  {vision.moodTags?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {vision.moodTags.map(t => <span key={t} className="text-xs text-brass/50 border border-brass/15 px-2 py-0.5">{t}</span>)}
                    </div>
                  )}
                  {vision.clarifyingQuestions?.length > 0 && (
                    <div>
                      <p className="flex items-center gap-1 text-brass/60 text-[10px] uppercase tracking-widest mb-2"><Lightbulb size={11} /> Questions to Consider</p>
                      <ul className="space-y-1">
                        {vision.clarifyingQuestions.map((q, i) => <li key={i} className="text-ivory/50 text-xs">• {q}</li>)}
                      </ul>
                    </div>
                  )}
                  <div className="space-y-2 pt-2">
                    <button onClick={handleApplyVision}
                      className="w-full bg-brass text-obsidian py-2.5 font-tight text-xs tracking-widest uppercase hover:bg-brass-light transition-all">
                      Apply to My Form
                    </button>
                    <button onClick={handlePricing} disabled={pricingLoading}
                      className="w-full flex items-center justify-center gap-1 border border-brass/30 text-brass py-2.5 font-tight text-xs tracking-wide hover:bg-brass/10 transition-all disabled:opacity-30">
                      {pricingLoading ? <Loader2 size={12} className="animate-spin" /> : <DollarSign size={12} />} Get Detailed Price Estimate
                    </button>
                  </div>
                  {pricing && !pricing.error && (
                    <div className="bg-carbon p-4 border border-brass/20">
                      <p className="text-brass text-2xl font-display">{pricing.priceRange}</p>
                      <p className="text-ivory/50 text-xs leading-relaxed mt-1">{pricing.rationale}</p>
                      <p className="text-ivory/40 text-xs mt-2">50% deposit to begin: <span className="text-brass">${pricing.deposit}</span></p>
                    </div>
                  )}
                  {pricing?.error && <p className="text-red-400/60 text-xs">{pricing.error}</p>}
                </div>
              )}
              {vision?.error && <p className="text-red-400/60 text-sm">{vision.error}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}