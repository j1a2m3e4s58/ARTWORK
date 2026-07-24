import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { studioClient } from '@/api/studioClient';

export default function BulkImportModal({ type, onClose, onImported }) {
  const [status, setStatus] = useState('idle'); // idle | parsing | importing | done | error
  const [results, setResults] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const isArtwork = type === 'artwork';
  const sampleCsv = isArtwork
    ? `title,category,imageUrl,medium,dimensions,year,price,description\nMy Portrait,Portraits,https://example.com/img.jpg,Oil on Canvas,24x30in,2024,350,A beautiful portrait`
    : `title,type,imageUrl,price,inventory,dimensions,description\nMy Print,Print,https://example.com/img.jpg,89,5,20x28in,Fine art giclee print`;

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setStatus('parsing');
    setErrorMsg('');

    const text = await file.text();
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const obj = {};
      headers.forEach((h, i) => { if (vals[i]) obj[h] = vals[i]; });
      return obj;
    }).filter(r => r.title);

    if (rows.length === 0) {
      setStatus('error');
      setErrorMsg('No valid rows found. Make sure your CSV has a "title" column.');
      return;
    }

    setStatus('importing');
    const entity = isArtwork ? studioClient.entities.Artwork : studioClient.entities.ShopProduct;
    const created = [];
    const failed = [];

    for (const row of rows) {
      const data = { ...row };
      if (data.price) data.price = parseFloat(data.price);
      if (data.inventory) data.inventory = parseInt(data.inventory);
      const record = await entity.create(data).catch(() => null);
      if (record) created.push(record); else failed.push(row.title);
    }

    setResults({ created, failed });
    setStatus('done');
    onImported(created);
  };

  return (
    <motion.div className="fixed inset-0 z-[9900] flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-obsidian/90 backdrop-blur-xl" onClick={onClose} />
      <motion.div className="relative z-10 w-full max-w-md glass-panel p-8 border border-brass/20"
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-5 right-5 text-ivory/30 hover:text-brass transition-colors"><X size={16} /></button>
        <h3 className="font-display text-2xl text-ivory mb-2">Bulk Import {isArtwork ? 'Artworks' : 'Products'}</h3>
        <p className="text-ivory/40 text-xs mb-6">Upload a CSV file to import multiple {isArtwork ? 'artworks' : 'products'} at once.</p>

        {status === 'idle' && (
          <div className="space-y-4">
            <div className="bg-obsidian border border-brass/10 p-4 rounded">
              <p className="text-ivory/40 text-xs font-tight uppercase tracking-widest mb-2">Expected columns:</p>
              <p className="text-ivory/60 text-xs font-mono leading-relaxed">
                {isArtwork ? 'title, category, imageUrl, medium, dimensions, year, price, description' : 'title, type, imageUrl, price, inventory, dimensions, description'}
              </p>
            </div>
            <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(sampleCsv)}`} download={`${type}_import_template.csv`}
              className="block text-center border border-brass/20 text-brass/60 py-2 text-xs font-tight hover:border-brass/40 hover:text-brass transition-colors">
              Download Template CSV
            </a>
            <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-brass/20 p-8 cursor-pointer hover:border-brass/40 transition-colors">
              <Upload size={24} className="text-brass/40" />
              <span className="text-ivory/50 text-sm font-tight">Click to select CSV file</span>
              <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
            </label>
          </div>
        )}

        {status === 'parsing' && (
          <div className="flex flex-col items-center py-10 gap-3">
            <Loader2 size={32} className="text-brass animate-spin" />
            <p className="text-ivory/50 text-sm">Parsing file...</p>
          </div>
        )}

        {status === 'importing' && (
          <div className="flex flex-col items-center py-10 gap-3">
            <Loader2 size={32} className="text-brass animate-spin" />
            <p className="text-ivory/50 text-sm">Importing records...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center py-10 gap-3">
            <AlertCircle size={32} className="text-red-400" />
            <p className="text-red-400 text-sm text-center">{errorMsg}</p>
            <button onClick={() => setStatus('idle')} className="border border-brass/20 text-ivory/50 px-4 py-2 text-xs font-tight hover:border-brass/40 mt-2">Try Again</button>
          </div>
        )}

        {status === 'done' && results && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 p-4">
              <CheckCircle size={20} className="text-green-400 flex-shrink-0" />
              <div>
                <p className="text-green-400 font-tight text-sm">{results.created.length} records imported successfully</p>
                {results.failed.length > 0 && <p className="text-red-400 text-xs mt-1">{results.failed.length} failed: {results.failed.slice(0, 3).join(', ')}</p>}
              </div>
            </div>
            <button onClick={onClose} className="w-full bg-brass text-obsidian py-3 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all">Done</button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
