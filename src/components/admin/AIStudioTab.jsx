import { useState } from 'react';
import { Sparkles, Loader2, FileText, Hash, Image, Copy, Check, Wand2 } from 'lucide-react';
import { generateBlogDraft, generateCaptions, generateDescription } from '@/lib/aiHelpers';
import { base44 } from '@/api/base44Client';

function SectionHeader({ icon: Icon, title, desc }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className="text-brass" />
        <h2 className="font-display text-2xl text-ivory">{title}</h2>
      </div>
      <p className="text-ivory/40 text-sm">{desc}</p>
    </div>
  );
}

function BlogGenerator() {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('inspiring');
  const [keywords, setKeywords] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!topic) return;
    setLoading(true);
    setResult(null);
    try {
      const draft = await generateBlogDraft({ topic, tone, keywords });
      setResult(draft);
    } catch (e) {
      setResult({ error: 'Generation failed. Please try again.' });
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    const slug = result.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await base44.entities.BlogPost.create({
      title: result.title,
      slug,
      content: result.content,
      excerpt: result.excerpt,
      readTime: result.readTime || 4,
      tags: result.tags || [],
      publishedDate: new Date().toISOString().split('T')[0],
      author: 'Reigns Atelier',
    });
    setResult(null);
    setTopic('');
  };

  return (
    <div className="bg-carbon border border-brass/10 p-6">
      <SectionHeader icon={FileText} title="Blog Post Generator" desc="Generate a complete blog draft from a topic." />
      <div className="space-y-3 mb-4">
        <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Topic e.g. 'The art of capturing emotion in portraits'"
          className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors" />
        <div className="grid grid-cols-2 gap-3">
          <select value={tone} onChange={e => setTone(e.target.value)}
            className="bg-obsidian border border-brass/20 text-ivory/70 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40">
            {['inspiring', 'technical', 'personal', 'educational', 'playful'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="Keywords (comma separated)"
            className="bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors" />
        </div>
      </div>
      <button onClick={handleGenerate} disabled={!topic || loading}
        className="flex items-center gap-2 bg-brass text-obsidian px-5 py-2.5 font-tight text-sm tracking-wide hover:bg-brass-light transition-all disabled:opacity-30">
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate Draft
      </button>

      {result && !result.error && (
        <div className="mt-5 border border-brass/20 p-5 bg-obsidian/50">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3 className="font-display text-xl text-ivory">{result.title}</h3>
            <div className="flex gap-2">
              <button onClick={() => { navigator.clipboard.writeText(result.content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="text-ivory/40 hover:text-brass text-xs font-tight flex items-center gap-1 flex-shrink-0">
                {copied ? <Check size={12} /> : <Copy size={12} />} Copy
              </button>
            </div>
          </div>
          <p className="text-brass/60 text-xs font-tight mb-3">{result.excerpt}</p>
          <div className="text-ivory/60 text-sm leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">{result.content}</div>
          <div className="flex flex-wrap gap-1 mt-4">
            {(result.tags || []).map(t => <span key={t} className="text-xs text-brass/50 border border-brass/20 px-2 py-0.5">#{t}</span>)}
          </div>
          <button onClick={handleCreate}
            className="w-full flex items-center justify-center gap-2 bg-brass text-obsidian py-2.5 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all mt-4">
            <Check size={14} /> Publish as Blog Post
          </button>
        </div>
      )}
      {result?.error && <p className="text-red-400/60 text-sm mt-3">{result.error}</p>}
    </div>
  );
}

function CaptionGenerator() {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [platform, setPlatform] = useState('Instagram');
  const [loading, setLoading] = useState(false);
  const [captions, setCaptions] = useState(null);

  const handleGenerate = async () => {
    if (!title) return;
    setLoading(true);
    try {
      const res = await generateCaptions({ artworkTitle: title, description: desc, platform });
      setCaptions(res.captions);
    } catch (e) {
      setCaptions([{ text: 'Generation failed. Try again.', hashtags: [] }]);
    }
    setLoading(false);
  };

  return (
    <div className="bg-carbon border border-brass/10 p-6">
      <SectionHeader icon={Hash} title="Social Media Captions" desc="Generate captions for your latest artwork." />
      <div className="space-y-3 mb-4">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Artwork title"
          className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors" />
        <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Brief description or mood (optional)" rows={2}
          className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors resize-none" />
        <div className="flex gap-2">
          {['Instagram', 'Twitter', 'TikTok'].map(p => (
            <button key={p} onClick={() => setPlatform(p)}
              className={`px-4 py-2 text-xs font-tight border transition-all ${platform === p ? 'border-brass bg-brass/10 text-brass' : 'border-brass/20 text-ivory/50 hover:border-brass/40'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>
      <button onClick={handleGenerate} disabled={!title || loading}
        className="flex items-center gap-2 bg-brass text-obsidian px-5 py-2.5 font-tight text-sm tracking-wide hover:bg-brass-light transition-all disabled:opacity-30">
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate Captions
      </button>
      {captions && (
        <div className="mt-4 space-y-3">
          {captions.map((c, i) => (
            <div key={i} className="border border-brass/15 p-4 bg-obsidian/50">
              <p className="text-ivory/70 text-sm leading-relaxed">{c.text}</p>
              {c.hashtags?.length > 0 && (
                <p className="text-brass/50 text-xs mt-2">{c.hashtags.map(h => `#${h}`).join(' ')}</p>
              )}
              <button onClick={() => navigator.clipboard.writeText(`${c.text}\n\n${(c.hashtags || []).map(h => `#${h}`).join(' ')}`)}
                className="text-ivory/30 hover:text-brass text-xs font-tight flex items-center gap-1 mt-2">
                <Copy size={11} /> Copy
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DescriptionGenerator() {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Portraits');
  const [medium, setMedium] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  const handleGenerate = async () => {
    if (!title) return;
    setLoading(true);
    try {
      const desc = await generateDescription({ title, category, medium, notes });
      setResult(desc);
    } catch (e) {
      setResult('Generation failed. Try again.');
    }
    setLoading(false);
  };

  return (
    <div className="bg-carbon border border-brass/10 p-6">
      <SectionHeader icon={Image} title="Artwork Description" desc="Generate a poetic gallery description." />
      <div className="space-y-3 mb-4">
        <div className="grid grid-cols-2 gap-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Artwork title"
            className="bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors" />
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="bg-obsidian border border-brass/20 text-ivory/70 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40">
            {['Portraits', 'Sketches', 'Digital Art', 'Pencil Drawings', 'Anime Art', 'Realism'].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <input value={medium} onChange={e => setMedium(e.target.value)} placeholder="Medium (optional)"
          className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors" />
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes / mood (optional)"
          className="w-full bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors" />
      </div>
      <button onClick={handleGenerate} disabled={!title || loading}
        className="flex items-center gap-2 bg-brass text-obsidian px-5 py-2.5 font-tight text-sm tracking-wide hover:bg-brass-light transition-all disabled:opacity-30">
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Generate Description
      </button>
      {result && (
        <div className="mt-4 border border-brass/15 p-4 bg-obsidian/50">
          <p className="text-ivory/70 text-sm leading-relaxed">{result}</p>
          <button onClick={() => navigator.clipboard.writeText(result)}
            className="text-ivory/30 hover:text-brass text-xs font-tight flex items-center gap-1 mt-2">
            <Copy size={11} /> Copy
          </button>
        </div>
      )}
    </div>
  );
}

export default function AIStudioTab() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <Sparkles className="text-brass" size={24} />
        <h1 className="font-display text-4xl text-ivory">AI Content Studio</h1>
      </div>
      <p className="text-ivory/40 text-sm mb-8">Generate blog posts, social captions, and artwork descriptions with AI.</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <BlogGenerator />
        <div className="space-y-5">
          <CaptionGenerator />
          <DescriptionGenerator />
        </div>
      </div>
    </div>
  );
}