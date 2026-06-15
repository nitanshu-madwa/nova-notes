import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/store';
import { authAPI, foldersAPI, notesAPI } from '@/lib/api';
import { cn, FOLDER_ICONS } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Folder } from '@/types';

interface SidebarProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

// ── Nova logo mark ────────────────────────────────────────────────────────────
function NovaLogo({ size = 28 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '8px',
        background: 'linear-gradient(135deg, rgba(129,140,248,0.22), rgba(165,180,252,0.22))',
        border: '1px solid var(--border-accent)',
        boxShadow: '0 0 10px var(--accent-glow)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 800,
          fontSize: size * 0.52,
          color: 'var(--accent)',
          lineHeight: 1,
          letterSpacing: '-0.04em',
        }}
      >
        N
      </span>
    </div>
  );
}

export function Sidebar({ isDark, onToggleTheme }: SidebarProps) {
  const {
    sidebarSection, setSidebarSection,
    sidebarCollapsed, toggleSidebar,
    setActiveNote, user, clearAuth,
    setChatOpen, setSearchOpen,
    folders, setFolders,
  } = useAppStore();

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderIcon, setNewFolderIcon] = useState('📁');

  const qc = useQueryClient();

  const { data: foldersData } = useQuery({
    queryKey: ['folders'],
    queryFn: () => foldersAPI.list().then((r) => r.data as Folder[]),
  });
  const folderList = foldersData || folders;

  const createFolder = useMutation({
    mutationFn: (d: { name: string; icon: string }) => foldersAPI.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders'] });
      setNewFolderOpen(false);
      setNewFolderName('');
      toast.success('Folder created');
    },
    onError: () => toast.error('Failed to create folder'),
  });

  const createNote = useMutation({
    mutationFn: () => {
      const folderId = sidebarSection.startsWith('folder:')
        ? sidebarSection.replace('folder:', '')
        : undefined;
      return notesAPI.create({
        title: 'New Note',
        content: '',
        generate_ai_tags: false,
        ...(folderId ? { folder_id: folderId } : {}),
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['notes'] });
      setActiveNote(r.data.id);
      toast.success('Note created');
    },
  });

  async function handleSignOut() {
    try { await authAPI.signOut(); } catch { /* still clear local session */ }
    clearAuth();
    window.location.href = '/login';
  }

  function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    createFolder.mutate({ name: newFolderName.trim(), icon: newFolderIcon });
  }

  const navSections = [
    { id: 'all',         label: 'All Notes',   icon: '◈' },
    { id: 'favorites',   label: 'Favorites',   icon: '◆' },
    { id: 'archived',    label: 'Archive',     icon: '◻' },
    { id: 'whiteboards', label: 'Whiteboards', icon: '⬡' },
    { id: 'chat',        label: 'AI Chat',     icon: '✦' },
  ] as const;

  const sidebarStyle = {
    borderRight: '1px solid var(--border)',
    background: 'var(--bg-sidebar)',
    backdropFilter: 'blur(24px)',
  };

  if (sidebarCollapsed) {
    return (
      <div
        className="flex flex-col items-center py-4 gap-3 w-14 relative z-10 flex-shrink-0"
        style={sidebarStyle}
      >
        <button
          onClick={toggleSidebar}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          style={{ color: 'var(--accent)' }}
        >
          <span className="text-base">☰</span>
        </button>
        <div className="h-px w-7 my-1" style={{ background: 'var(--border)' }} />
        {navSections.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setSidebarSection(s.id as typeof sidebarSection);
              if (s.id === 'chat') setChatOpen(true);
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all"
            style={{ color: sidebarSection === s.id ? 'var(--accent)' : 'var(--text-muted)', background: sidebarSection === s.id ? 'var(--accent-glow)' : 'transparent' }}
          >
            {s.icon}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={onToggleTheme}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all hover:bg-[var(--surface-hover)]"
          style={{ color: 'var(--text-secondary)' }}
          title={isDark ? 'Switch to Light' : 'Switch to Dark'}
        >
          {isDark ? '☀' : '☾'}
        </button>
        <button
          onClick={() => createNote.mutate()}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-base transition-all"
          style={{ color: 'var(--accent)', background: 'var(--accent-glow)', border: '1px solid var(--border-accent)' }}
        >+</button>
      </div>
    );
  }

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="w-60 flex flex-col relative z-10 flex-shrink-0"
      style={sidebarStyle}
    >
      {/* Header */}
      <div className="px-4 pt-5 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <NovaLogo size={28} />
          <span className="font-display text-base font-bold gradient-text-cyan">Nova</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleTheme}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text-secondary)' }}
            title={isDark ? 'Switch to Light mode' : 'Switch to Dark mode'}
          >
            {isDark ? '☀' : '☾'}
          </button>
          <button
            onClick={toggleSidebar}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text-muted)' }}
          >
            ◀
          </button>
        </div>
      </div>

      {/* Search shortcut */}
      <div className="px-3 mb-3">
        <button
          onClick={() => setSearchOpen(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          <span className="text-xs">⌕</span>
          <span className="flex-1 text-left text-xs font-mono">Search notes…</span>
          <span
            className="text-xs font-mono px-1.5 py-0.5 rounded"
            style={{ background: 'var(--accent-glow)', border: '1px solid var(--border-accent)', color: 'var(--accent)' }}
          >⌘K</span>
        </button>
      </div>

      {/* New Note button */}
      <div className="px-3 mb-4">
        <button onClick={() => createNote.mutate()} className="btn-primary w-full flex items-center justify-center gap-2">
          <span className="text-base leading-none">+</span>
          New Note
        </button>
      </div>

      {/* Nav sections */}
      <div className="px-3 space-y-0.5 mb-3">
        {navSections.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setSidebarSection(s.id as typeof sidebarSection);
              if (s.id === 'chat') setChatOpen(true);
              else setActiveNote(null);
            }}
            className={cn('nav-item w-full', sidebarSection === s.id ? 'active' : '')}
          >
            <span className="text-base w-5 text-center">{s.icon}</span>
            <span>{s.label}</span>
            {s.id === 'chat' && (
              <span
                className="ml-auto text-xs px-1.5 py-0.5 rounded-full font-mono"
                style={{ background: 'var(--accent-glow)', border: '1px solid var(--border-accent)', color: 'var(--accent)' }}
              >AI</span>
            )}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="px-4 mb-2.5 flex items-center gap-2">
        <div
          className="h-px flex-1"
          style={{ background: 'linear-gradient(90deg, var(--border-accent), transparent)' }}
        />
        <span className="text-xs font-mono" style={{ color: 'var(--accent)' }}>FOLDERS</span>
        <button
          onClick={() => setNewFolderOpen(true)}
          className="text-xs font-mono transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          + NEW
        </button>
      </div>

      {/* Folders */}
      <div className="px-3 space-y-0.5 flex-1 overflow-y-auto hide-scrollbar">
        {folderList.map((folder) => (
          <button
            key={folder.id}
            onClick={() => { setSidebarSection(`folder:${folder.id}`); setActiveNote(null); }}
            className={cn('nav-item w-full group', sidebarSection === `folder:${folder.id}` ? 'active' : '')}
          >
            <span className="text-base">{folder.icon || '📁'}</span>
            <span className="flex-1 truncate text-left">{folder.name}</span>
            {folder.note_count > 0 && (
              <span
                className="text-xs font-mono ml-auto px-1.5 py-0.5 rounded"
                style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}
              >
                {folder.note_count}
              </span>
            )}
          </button>
        ))}

        {/* New folder form — fixed: no blank screen, safe submit */}
        <AnimatePresence>
          {newFolderOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="p-3 rounded-xl mt-2"
              style={{ background: 'var(--accent-glow)', border: '1px solid var(--border-accent)' }}
            >
              <div className="flex gap-1.5 mb-2 flex-wrap">
                {FOLDER_ICONS.slice(0, 8).map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setNewFolderIcon(icon)}
                    className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all hover:bg-[var(--surface-hover)]',
                      newFolderIcon === icon ? 'bg-[var(--accent-glow)] border border-[var(--border-accent)]' : ''
                    )}
                  >
                    {icon}
                  </button>
                ))}
              </div>
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleCreateFolder(); }
                  if (e.key === 'Escape') { e.preventDefault(); setNewFolderOpen(false); }
                }}
                placeholder="Folder name…"
                className="input-void text-xs mb-2"
              />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleCreateFolder}
                  disabled={createFolder.isPending}
                  className="btn-primary text-xs px-3 py-1.5 flex-1"
                >
                  {createFolder.isPending ? '…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => { setNewFolderOpen(false); setNewFolderName(''); }}
                  className="btn-ghost text-xs px-3 py-1.5"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer: user */}
      <div className="px-3 py-3 mt-auto" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl group cursor-pointer transition-colors hover:bg-[var(--surface)]">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-display font-bold flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(129,140,248,0.22), rgba(165,180,252,0.22))',
              border: '1px solid var(--border-accent)',
              color: 'var(--accent)',
            }}
          >
            {user?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-display font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {user?.full_name || 'User'}
            </div>
            <div className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>
              {user?.email}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="opacity-0 group-hover:opacity-100 text-xs font-mono transition-opacity"
            style={{ color: 'var(--plasma)' }}
            title="Sign out"
          >⏻</button>
        </div>
      </div>
    </motion.aside>
  );
}
