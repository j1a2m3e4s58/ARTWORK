import { useState, useRef } from 'react';
import { Upload, Loader2, X } from 'lucide-react';
import { studioClient } from '@/api/studioClient';

/**
 * Dual-mode field: paste a URL OR upload from PC.
 * Props:
 *   label       - field label
 *   value       - current url string
 *   onChange    - (url: string) => void
 *   accept      - mime types e.g. "image/*" or "video/*,image/*"
 *   placeholder - input placeholder
 */
export default function FileUploadField({ label, value, onChange, accept = 'image/*', placeholder = 'Paste URL or upload file...' }) {
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState('url'); // 'url' | 'file'
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const { file_url } = await studioClient.integrations.Core.UploadFile({ file });
      onChange(file_url);
      setMode('url');
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-ivory/40 text-xs font-tight uppercase tracking-widest">{label}</label>
        <div className="flex gap-1">
          <button type="button" onClick={() => setMode('url')}
            className={`text-[10px] font-tight px-2 py-0.5 transition-colors ${mode === 'url' ? 'text-brass border-b border-brass' : 'text-ivory/30 hover:text-ivory/60'}`}>
            URL
          </button>
          <button type="button" onClick={() => { setMode('file'); setTimeout(() => inputRef.current?.click(), 50); }}
            className={`text-[10px] font-tight px-2 py-0.5 transition-colors ${mode === 'file' ? 'text-brass border-b border-brass' : 'text-ivory/30 hover:text-ivory/60'}`}>
            Upload
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => handleFile(e.target.files[0])}
      />

      {uploading ? (
        <div className="w-full bg-obsidian border border-brass/20 px-4 py-2.5 flex items-center gap-2 text-sm text-ivory/40">
          <Loader2 size={14} className="animate-spin text-brass" />
          <span>Uploading...</span>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-obsidian border border-brass/20 text-ivory/80 px-4 py-2.5 text-sm focus:outline-none focus:border-brass/40 transition-colors"
          />
          {/* Upload button */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 border border-brass/30 text-brass/70 px-3 py-2.5 text-xs font-tight hover:border-brass hover:text-brass transition-colors whitespace-nowrap"
          >
            <Upload size={13} /> From PC
          </button>
          {/* Clear */}
          {value && (
            <button type="button" onClick={() => onChange('')}
              className="border border-ivory/10 text-ivory/30 px-2 hover:text-red-400 hover:border-red-500/30 transition-colors">
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {/* Preview */}
      {value && (accept.includes('image') || !accept.includes('video')) && (
        <img src={value} alt="" className="mt-2 h-20 w-auto object-cover border border-brass/10 opacity-70" onError={e => e.target.style.display = 'none'} />
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
