import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cn, truncate, formatNoteDate } from '@/lib/utils';
import { notesAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import type { Note } from '@/types';

interface Props {
  note: Note;
  viewMode: 'grid' | 'list';
  isActive: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onToggleFav: () => void;
}

export function NoteCard({ note, viewMode, isActive, onOpen, onDelete, onToggleFav }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const qc = useQueryClient();

  const archiveMutation = useMutation({
    mutationFn: () =>
      note.status === 'archived'
        ? notesAPI.unarchive(note.id)
        : notesAPI.archive(note.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] });
      toast.success(note.status === 'archived' ? 'Note restored' : 'Note archived');
    },
    onError: () => toast.error('Action failed'),
  });

  const accentColor = note.color || 'rgba(129,140,248,0.3)';
  const hasAccent = !!note.color;

  if (viewMode === 'list') {
    return (
      <div
        onClick={onOpen}
        className={cn('note-card flex flex-col gap-3 py-5 px-6 rounded-[28px]', isActive && 'selected')}
        style={hasAccent ? { borderLeftColor: accentColor, borderLeftWidth: '4px' } : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {note.is_pinned && <span className="text-xs" style={{ color: 'var(--accent)' }}>⊕</span>}
              {note.is_favorite && <span className="text-xs text-amber-400">◆</span>}
              <span className="font-display font-semibold text-base truncate" style={{ color: 'var(--text-primary)' }}>
                {note.title || 'Untitled'}
              </span>
            </div>
            <span className="text-sm font-body truncate block leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {truncate(note.content, 100)}
            </span>
          </div>
          <span className="text-[10px] font-mono whitespace-nowrap pt-1" style={{ color: 'var(--text-muted)' }}>
            {formatNoteDate(note.updated_at)}
          </span>
        </div>

        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {note.tags.slice(0, 2).map((t) => (
              <span key={t} className="tag text-[10px]">{t}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn('note-card group relative flex h-full min-h-[240px] flex-col p-6 rounded-[32px]', isActive && 'selected')}
      style={hasAccent ? { borderTopColor: accentColor, borderTopWidth: '3px' } : undefined}
      onClick={onOpen}
    >
      {hasAccent && (
        <div className="absolute top-0 left-4 right-4 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`, opacity: 0.55 }} />
      )}

      {/* Badges row */}
      <div className="flex items-center gap-3 mb-4">
        {note.is_pinned && (
          <span className="text-xs px-1.5 py-0.5 rounded font-mono"
            style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>⊕ pinned</span>
        )}
        {note.is_favorite && <span className="text-amber-400 text-sm">◆</span>}
        <div className="flex-1" />
        {/* Options menu */}
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text-secondary)' }}
          >⋯</button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -5 }}
                className="absolute right-0 top-7 z-50 w-44 py-1.5 rounded-xl"
                style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-accent)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', backdropFilter: 'blur(20px)' }}
                onMouseLeave={() => setMenuOpen(false)}
              >
                {[
                  {
                    label: note.is_favorite ? '◇ Unfavorite' : '◆ Favorite',
                    fn: onToggleFav, danger: false,
                  },
                  {
                    label: note.status === 'archived' ? '↑ Restore' : '◻ Archive',
                    fn: () => archiveMutation.mutate(), danger: false,
                  },
                  { label: '✕ Delete', fn: onDelete, danger: true },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={(e) => { e.stopPropagation(); item.fn(); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-2 text-xs font-body transition-colors hover:bg-[var(--surface-hover)]"
                    style={{ color: item.danger ? 'var(--plasma)' : 'var(--text-secondary)' }}
                    onMouseEnter={e => e.currentTarget.style.color = item.danger ? 'var(--plasma)' : 'var(--text-primary)'}
                    onMouseLeave={e => e.currentTarget.style.color = item.danger ? 'var(--plasma)' : 'var(--text-secondary)'}
                  >{item.label}</button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Title */}
      <h3 className="font-display font-semibold text-base mb-2 leading-snug line-clamp-2"
        style={{ color: 'var(--text-primary)' }}>
        {note.title || 'Untitled Note'}
      </h3>

      {/* Preview */}
      <p className="text-sm font-body leading-relaxed line-clamp-4 mb-5" style={{ color: 'var(--text-secondary)' }}>
        {truncate(note.content, 150) || 'Empty note…'}
      </p>

      {/* Footer */}
      <div className="flex items-center gap-3 mt-auto pt-2 border-t border-[rgba(255,255,255,0.08)]">
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {note.tags.slice(0, 3).map((t) => (
            <span key={t} className="tag" style={{ fontSize: '10px' }}>{t}</span>
          ))}
        </div>
        <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
          {formatNoteDate(note.updated_at)}
        </span>
      </div>

      {note.word_count > 0 && (
        <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-xs font-mono" style={{ color: 'var(--accent)' }}>{note.word_count}w</span>
        </div>
      )}
    </div>
  );
}
