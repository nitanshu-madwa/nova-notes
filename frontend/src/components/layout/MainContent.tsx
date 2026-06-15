import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { notesAPI } from '@/lib/api';
import { NoteCard } from '@/components/notes/NoteCard';
import { WhiteboardsList } from '@/components/whiteboard/WhiteboardsList';
import { cn, formatNoteDate } from '@/lib/utils';
import type { Note } from '@/types';
import toast from 'react-hot-toast';

interface MainContentProps {
  collapsed?: boolean;
}

export function MainContent({ collapsed = false }: MainContentProps) {
  const { sidebarSection, viewMode, setViewMode, setActiveNote, activeNoteId, folders } = useAppStore();
  const [sortBy, setSortBy] = useState<'updated_at' | 'created_at' | 'title'>('updated_at');
  const qc = useQueryClient();

  const queryParams = useMemo(() => {
    if (sidebarSection === 'favorites') return { is_favorite: true, status: 'active' };
    if (sidebarSection === 'archived') return { status: 'archived' };
    if (sidebarSection.startsWith('folder:')) return { folder_id: sidebarSection.replace('folder:', ''), status: 'active' };
    if (sidebarSection.startsWith('tag:')) return { tag: sidebarSection.replace('tag:', ''), status: 'active' };
    return { status: 'active' };
  }, [sidebarSection]);

  const { data, isLoading } = useQuery({
    queryKey: ['notes', queryParams, sortBy],
    queryFn: () => notesAPI.list({ ...queryParams, sort_by: sortBy, page_size: 100 }).then((r) => r.data),
    enabled: sidebarSection !== 'whiteboards' && sidebarSection !== 'chat',
  });

  const notes: Note[] = data?.notes || [];
  const activeViewMode = collapsed ? 'list' : viewMode;

  const deleteMutation = useMutation({
    mutationFn: notesAPI.delete,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['notes'] });
      if (activeNoteId === id) setActiveNote(null);
      toast.success('Note deleted');
    },
  });

  const toggleFav = useMutation({
    mutationFn: notesAPI.toggleFavorite,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });

  if (sidebarSection === 'whiteboards') return <WhiteboardsList />;
  if (sidebarSection === 'chat') return null;

  const sectionTitle =
    sidebarSection === 'all' ? 'All Notes' :
    sidebarSection === 'favorites' ? 'Favorites' :
    sidebarSection === 'archived' ? 'Archive' :
    sidebarSection.startsWith('folder:') ? (() => {
      const folderId = sidebarSection.replace('folder:', '');
      const folder = folders.find((f) => f.id === folderId);
      return folder ? `${folder.icon || '📁'} ${folder.name}` : '📁 Folder';
    })() :
    sidebarSection;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div
        className="flex items-center gap-4 px-6 py-5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h1 className="font-display text-base font-bold flex-1" style={{ color: 'var(--text-primary)' }}>
          {sectionTitle}
        </h1>

        {notes.length > 0 && (
          <span
            className="text-xs font-mono px-2 py-0.5 rounded-full"
            style={{ background: 'var(--accent-glow)', border: '1px solid var(--border-accent)', color: 'var(--accent)' }}
          >
            {notes.length}
          </span>
        )}

        {!collapsed && (
          <>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="select-futuristic"
            >
              <option value="updated_at">Updated</option>
              <option value="created_at">Created</option>
              <option value="title">Title</option>
            </select>

            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {(['grid', 'list'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className="px-2.5 py-1.5 text-xs transition-all"
                  style={{
                    background: viewMode === m ? 'var(--accent-glow)' : 'transparent',
                    color: viewMode === m ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {m === 'grid' ? '⊞' : '≡'}
                </button>
              ))}
            </div>
          </>
        )}

        {collapsed && (
          <span className="text-xs font-mono text-[var(--text-muted)]">Note list</span>
        )}
      </div>

      {/* Notes content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {isLoading ? (
          <NotesLoadingSkeleton viewMode={activeViewMode} />
        ) : notes.length === 0 ? (
          <EmptyState section={sidebarSection} />
        ) : (
          <motion.div layout className="w-full max-w-[1500px] mx-auto">
            <div className={cn(
              activeViewMode === 'grid'
                ? 'grid gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 auto-rows-auto'
                : 'flex flex-col gap-4'
            )}>
            <AnimatePresence mode="popLayout">
              {notes.map((note, i) => (
                <motion.div
                  key={note.id} layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.03, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                >
                  <NoteCard
                    note={note}
                    viewMode={activeViewMode}
                    isActive={note.id === activeNoteId}
                    onOpen={() => setActiveNote(note.id)}
                    onDelete={() => deleteMutation.mutate(note.id)}
                    onToggleFav={() => toggleFav.mutate(note.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ section }: { section: string }) {
  const { setActiveNote } = useAppStore();
  const qc = useQueryClient();

  const folderId = section.startsWith('folder:') ? section.replace('folder:', '') : undefined;

  const createNote = useMutation({
    mutationFn: () => notesAPI.create({
      title: 'New Note',
      content: '',
      ...(folderId ? { folder_id: folderId } : {}),
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['notes'] });
      setActiveNote(r.data.id);
    },
  });

  const isFolder = !!folderId;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-full min-h-[400px] text-center py-20"
    >
      <div
        className="w-18 h-18 rounded-2xl flex items-center justify-center text-3xl mb-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {section === 'favorites' ? '◆' : section === 'archived' ? '◻' : isFolder ? '📁' : '◈'}
      </div>
      <h3 className="font-display text-base font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
        {section === 'favorites' ? 'No favorites yet' : section === 'archived' ? 'Archive is empty' : isFolder ? 'Folder is empty' : 'No notes yet'}
      </h3>
      <p className="text-sm font-body mb-6 max-w-xs" style={{ color: 'var(--text-muted)' }}>
        {section === 'favorites'
          ? 'Star a note to find it quickly here'
          : section === 'archived'
          ? 'Archived notes will appear here'
          : isFolder
          ? 'Create a note directly inside this folder'
          : 'Create your first note to begin your journey'}
      </p>
      {(section === 'all' || isFolder) && (
        <button onClick={() => createNote.mutate()} className="btn-primary">
          + Create Note{isFolder ? ' in Folder' : ''}
        </button>
      )}
    </motion.div>
  );
}

function NotesLoadingSkeleton({ viewMode }: { viewMode: 'grid' | 'list' }) {
  return (
    <div className={cn(viewMode === 'grid' ? 'grid gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3' : 'flex flex-col gap-5')}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-[28px] shimmer"
          style={{ height: viewMode === 'grid' ? '220px' : '90px', border: '1px solid var(--border)', animationDelay: `${i * 0.1}s` }} />
      ))}
    </div>
  );
}
