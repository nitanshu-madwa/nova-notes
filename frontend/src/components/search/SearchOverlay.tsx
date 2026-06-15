import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store';
import { searchAPI } from '@/lib/api';
import { formatNoteDate } from '@/lib/utils';
import type { Note } from '@/types';

export function SearchOverlay() {
  const { setSearchOpen, setActiveNote } = useAppStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchAPI.search({ q: query, query: query, limit: 8 });
        setResults(res.data?.results ?? []);
        setSelected(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query]);

  function openNote(id: string) {
    setActiveNote(id);
    setSearchOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && results[selected]) openNote(results[selected].id);
    if (e.key === 'Escape') setSearchOpen(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={() => setSearchOpen(false)}
    >
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-xl rounded-2xl overflow-hidden"
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-accent)',
          boxShadow: '0 0 48px var(--accent-glow), 0 24px 56px rgba(0,0,0,0.4)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--accent)', fontSize: '1.1rem' }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search notes…"
            className="flex-1 bg-transparent outline-none text-sm font-body"
            style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
          />
          {loading && (
            <div className="w-4 h-4 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--border-accent)', borderTopColor: 'transparent' }} />
          )}
          <kbd className="text-xs font-mono px-1.5 py-0.5 rounded"
            style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="py-2 max-h-80 overflow-y-auto">
            {results.map((note, i) => (
              <button
                key={note.id}
                onClick={() => openNote(note.id)}
                className="w-full text-left px-4 py-2.5 transition-all"
                style={{
                  background: i === selected ? 'var(--accent-glow)' : 'transparent',
                  borderLeft: i === selected ? '2px solid var(--accent)' : '2px solid transparent',
                }}
                onMouseEnter={() => setSelected(i)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-body truncate" style={{ color: 'var(--text-primary)' }}>
                    {note.title || 'Untitled'}
                  </span>
                  <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {formatNoteDate(note.updated_at)}
                  </span>
                </div>
                {note.content && (
                  <p className="text-xs font-body mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                    {note.content.replace(/[#*`]/g, '').slice(0, 80)}
                  </p>
                )}
                {note.tags && note.tags.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {note.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="text-xs font-mono px-1.5 py-0.5 rounded-full"
                        style={{ background: 'var(--surface)', color: 'var(--accent)', border: '1px solid var(--border-accent)' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {query && !loading && results.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-sm font-body" style={{ color: 'var(--text-muted)' }}>
              No notes found for "{query}"
            </p>
            <p className="text-xs font-mono mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
              Try different keywords or check spelling
            </p>
          </div>
        )}

        {/* Footer */}
        {!query && (
          <div className="px-4 py-3 flex gap-4">
            {[['↑↓', 'navigate'], ['↵', 'open'], ['ESC', 'close']].map(([key, label]) => (
              <span key={key} className="flex items-center gap-1.5 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                <kbd className="px-1.5 py-0.5 rounded text-xs"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>{key}</kbd>
                {label}
              </span>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
