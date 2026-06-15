import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '@/store';
import { notesAPI, foldersAPI } from '@/lib/api';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { SearchOverlay } from '@/components/search/SearchOverlay';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { NoteEditor } from '@/components/editor/NoteEditor';

export function AppShell() {
  const { setNotes, setFolders, activeNoteId, chatOpen, searchOpen } = useAppStore();
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('ae_theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove('dark', 'light');
    html.classList.add(isDark ? 'dark' : 'light');
    localStorage.setItem('ae_theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const { data: notesData } = useQuery({
    queryKey: ['notes'],
    queryFn: () => notesAPI.list({ status: 'active', page_size: 100 }),
    select: (r) => r.data,
  });

  const { data: foldersData } = useQuery({
    queryKey: ['folders'],
    queryFn: () => foldersAPI.list(),
    select: (r) => r.data,
  });

  useEffect(() => { if (notesData?.notes) setNotes(notesData.notes); }, [notesData, setNotes]);
  useEffect(() => { if (foldersData) setFolders(foldersData); }, [foldersData, setFolders]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        useAppStore.getState().setSearchOpen(true);
      }
      if (e.key === 'Escape') useAppStore.getState().setSearchOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const notePanelCollapsed = !!activeNoteId && !chatOpen;

  return (
    <div
      className="h-screen flex overflow-hidden scan-lines"
      style={{ background: 'var(--bg-main)' }}
    >
      {/* Background */}
      <div className="fixed inset-0 grid-bg pointer-events-none" />
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: isDark
            ? 'radial-gradient(ellipse 55% 38% at 68% 18%, rgba(129,140,248,0.055) 0%, transparent 70%), radial-gradient(ellipse 38% 28% at 18% 82%, rgba(165,180,252,0.035) 0%, transparent 70%)'
            : 'radial-gradient(ellipse 55% 38% at 68% 18%, rgba(79,70,229,0.035) 0%, transparent 70%)',
        }}
      />

      <Sidebar isDark={isDark} onToggleTheme={() => setIsDark((p) => !p)} />

      {/* Main area — flex row, grows to fill remaining width */}
      <div className="flex-1 flex overflow-hidden relative min-w-0">
        {/* Notes list — always visible unless chat fills space */}
        <div
          className={cn(
            'flex flex-col overflow-hidden transition-all duration-300',
            activeNoteId && chatOpen
              ? 'hidden lg:flex lg:w-44 xl:w-52'
              : notePanelCollapsed
              ? 'hidden md:flex md:w-[18rem] lg:w-[22rem] xl:w-[24rem]'
              : 'flex-1',
          )}
        >
          <MainContent collapsed={notePanelCollapsed} />
        </div>

        {/* Note Editor */}
        <AnimatePresence>
          {activeNoteId && (
            <motion.div
              key={activeNoteId}
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className={cn(
                'flex flex-col overflow-hidden',
                chatOpen
                  ? 'flex-1 min-w-0'
                  : 'flex-1 md:flex-none md:w-[68%] lg:w-[72%] xl:w-[76%]'
              )}
              style={{ position: 'relative' }}
            >
              <NoteEditor noteId={activeNoteId} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chat panel — fixed-width panel on the right */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 340, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            className="flex-shrink-0 overflow-hidden"
            style={{ maxWidth: '340px' }}
          >
            <ChatPanel />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search overlay */}
      <AnimatePresence>{searchOpen && <SearchOverlay />}</AnimatePresence>

      {/* Floating chat button */}
      {!chatOpen && (
        <button
          onClick={() => useAppStore.getState().setChatOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-13 h-13 rounded-2xl flex items-center justify-center font-display transition-all hover:scale-105"
          style={{
            width: '52px', height: '52px',
            background: 'linear-gradient(135deg, rgba(129,140,248,0.18), rgba(165,180,252,0.18))',
            border: '1px solid var(--border-accent)',
            boxShadow: '0 0 24px var(--accent-glow), 0 8px 28px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(20px)',
            color: 'var(--accent)',
          }}
          title="Open Nova AI"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <circle cx="9" cy="10" r="0.5" fill="currentColor" />
            <circle cx="12" cy="10" r="0.5" fill="currentColor" />
            <circle cx="15" cy="10" r="0.5" fill="currentColor" />
          </svg>
        </button>
      )}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}
