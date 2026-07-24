import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { studioClient } from '@/api/studioClient';

export default function QuotesTab() {
  const [quotes, setQuotes] = useState([]);
  const [draft, setDraft] = useState({ text: '', author: 'Anonymous' });

  const load = () => studioClient.entities.Quote.list('-created_date').then(setQuotes);
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!draft.text.trim()) return;
    const quote = await studioClient.entities.Quote.create({
      text: draft.text.trim(),
      author: draft.author.trim() || 'Anonymous',
      active: true,
    });
    setQuotes(current => [quote, ...current]);
    setDraft({ text: '', author: 'Anonymous' });
  };

  const update = async (quote) => {
    await studioClient.entities.Quote.update(quote.id, quote);
  };

  const remove = async (id) => {
    await studioClient.entities.Quote.delete(id);
    setQuotes(current => current.filter(quote => quote.id !== id));
  };

  return (
    <div>
      <h1 className="font-display text-4xl text-ivory mb-2">Art Quotes</h1>
      <p className="text-ivory/40 text-sm mb-8">Quotes rotate on the home page every eight seconds.</p>
      <div className="glass-panel border border-brass/15 p-5 mb-6 grid gap-3 md:grid-cols-[1fr_220px_auto]">
        <textarea value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })}
          placeholder="Enter an inspiring art quote" rows={2}
          className="bg-obsidian border border-brass/20 px-4 py-3 text-sm text-ivory resize-none focus:outline-none focus:border-brass/50" />
        <input value={draft.author} onChange={e => setDraft({ ...draft, author: e.target.value })}
          placeholder="Author or Anonymous"
          className="bg-obsidian border border-brass/20 px-4 py-3 text-sm text-ivory focus:outline-none focus:border-brass/50" />
        <button onClick={add} className="bg-brass text-obsidian px-5 py-3 flex items-center justify-center gap-2 text-sm">
          <Plus size={16} /> Add
        </button>
      </div>
      <div className="space-y-3">
        {quotes.map((quote, index) => (
          <div key={quote.id} className="grid gap-3 border border-brass/10 bg-carbon p-4 md:grid-cols-[1fr_220px_auto_auto]">
            <textarea value={quote.text} onChange={e => setQuotes(items => items.map((item, i) => i === index ? { ...item, text: e.target.value } : item))}
              rows={2} className="bg-obsidian border border-brass/15 px-3 py-2 text-sm text-ivory resize-none" />
            <input value={quote.author} onChange={e => setQuotes(items => items.map((item, i) => i === index ? { ...item, author: e.target.value } : item))}
              className="bg-obsidian border border-brass/15 px-3 py-2 text-sm text-ivory" />
            <button onClick={() => update(quote)} className="text-brass px-3 flex items-center justify-center"><Save size={17} /></button>
            <button onClick={() => remove(quote.id)} className="text-red-400 px-3 flex items-center justify-center"><Trash2 size={17} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
