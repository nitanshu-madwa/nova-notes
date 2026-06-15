import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Note, Folder, SidebarSection, ViewMode, ChatMode } from '@/types';

interface AppStore {
  // ── Auth ──────────────────────────────────────────────
  user: User | null;
  accessToken: string | null;
  setAuth: (user: User, token: string, refresh: string) => void;
  clearAuth: () => void;

  // ── Active note ───────────────────────────────────────
  activeNoteId: string | null;
  setActiveNote: (id: string | null) => void;

  // ── Sidebar ───────────────────────────────────────────
  sidebarSection: SidebarSection;
  setSidebarSection: (s: SidebarSection) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // ── View mode ─────────────────────────────────────────
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;

  // ── Search ────────────────────────────────────────────
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // ── Chat ──────────────────────────────────────────────
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;
  chatMode: ChatMode;
  setChatMode: (m: ChatMode) => void;
  chatSessionId: string | null;
  setChatSessionId: (id: string | null) => void;

  // ── AI Panel ──────────────────────────────────────────
  aiPanelOpen: boolean;
  setAiPanelOpen: (v: boolean) => void;

  // ── Local cache ───────────────────────────────────────
  notes: Note[];
  setNotes: (notes: Note[]) => void;
  upsertNote: (note: Note) => void;
  removeNote: (id: string) => void;

  folders: Folder[];
  setFolders: (folders: Folder[]) => void;
  upsertFolder: (folder: Folder) => void;
  removeFolder: (id: string) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Auth
      user: null,
      accessToken: null,
      setAuth: (user, token, refresh) => {
        localStorage.setItem('ae_access_token', token);
        localStorage.setItem('ae_refresh_token', refresh);
        set({ user, accessToken: token });
      },
      clearAuth: () => {
        localStorage.removeItem('ae_access_token');
        localStorage.removeItem('ae_refresh_token');
        set({ user: null, accessToken: null, notes: [], folders: [] });
      },

      // Active note
      activeNoteId: null,
      setActiveNote: (id) => set({ activeNoteId: id }),

      // Sidebar
      sidebarSection: 'all',
      setSidebarSection: (s) => set({ sidebarSection: s }),
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      // View mode
      viewMode: 'grid',
      setViewMode: (m) => set({ viewMode: m }),

      // Search
      searchOpen: false,
      setSearchOpen: (v) => set({ searchOpen: v }),
      searchQuery: '',
      setSearchQuery: (q) => set({ searchQuery: q }),

      // Chat
      chatOpen: false,
      setChatOpen: (v) => set({ chatOpen: v }),
      chatMode: 'general',
      setChatMode: (m) => set({ chatMode: m }),
      chatSessionId: null,
      setChatSessionId: (id) => set({ chatSessionId: id }),

      // AI Panel
      aiPanelOpen: false,
      setAiPanelOpen: (v) => set({ aiPanelOpen: v }),

      // Notes
      notes: [],
      setNotes: (notes) => set({ notes }),
      upsertNote: (note) =>
        set((s) => {
          const idx = s.notes.findIndex((n) => n.id === note.id);
          if (idx >= 0) {
            const next = [...s.notes];
            next[idx] = note;
            return { notes: next };
          }
          return { notes: [note, ...s.notes] };
        }),
      removeNote: (id) =>
        set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),

      // Folders
      folders: [],
      setFolders: (folders) => set({ folders }),
      upsertFolder: (folder) =>
        set((s) => {
          const idx = s.folders.findIndex((f) => f.id === folder.id);
          if (idx >= 0) {
            const next = [...s.folders];
            next[idx] = folder;
            return { folders: next };
          }
          return { folders: [...s.folders, folder] };
        }),
      removeFolder: (id) =>
        set((s) => ({ folders: s.folders.filter((f) => f.id !== id) })),
    }),
    {
      name: 'novanotes-store',
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        viewMode: s.viewMode,
        sidebarSection: s.sidebarSection,
        chatMode: s.chatMode,
        chatSessionId: s.chatSessionId,
      }),
    }
  )
);
