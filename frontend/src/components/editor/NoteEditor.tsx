import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Heading from '@tiptap/extension-heading';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import Blockquote from '@tiptap/extension-blockquote';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockExt from '@tiptap/extension-code-block';
import Link from '@tiptap/extension-link';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { notesAPI, aiAPI } from '@/lib/api';
import { AIPanel } from './AIPanel';
import { cn, NOTE_COLORS } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useDebounce } from 'use-debounce';
import type { Note } from '@/types';

interface Props { noteId: string; }

// Available fonts for notes
const NOTE_FONTS = [
  { label: 'DM Sans',        value: 'DM Sans',          class: 'font-body'   },
  { label: 'Inter',          value: 'Inter',             class: 'font-inter'  },
  { label: 'Space Grotesk',  value: 'Space Grotesk',     class: 'font-grotesk'},
  { label: 'Outfit',         value: 'Outfit',            class: 'font-outfit' },
  { label: 'Raleway',        value: 'Raleway',           class: 'font-raleway'},
  { label: 'Playfair',       value: 'Playfair Display',  class: 'font-playfair'},
  { label: 'Mono',           value: 'JetBrains Mono',    class: 'font-mono-code'},
];

export function NoteEditor({ noteId }: Props) {
  const { setActiveNote, upsertNote } = useAppStore();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [isFav, setIsFav] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [activeFont, setActiveFont] = useState(NOTE_FONTS[0]);
  const lastSavedRef = useRef<string>('');

  // Load note
  const { data: noteData } = useQuery({
    queryKey: ['note', noteId],
    queryFn: () => notesAPI.get(noteId).then((r) => r.data as Note),
    enabled: !!noteId,
  });

  const editor = useEditor({
    extensions: [
      // Disable headings/lists in StarterKit and register explicit extensions
      StarterKit.configure({ heading: false, bulletList: false, orderedList: false, codeBlock: false }),
      Heading.configure({ levels: [1, 2, 3] }),
      BulletList,
      OrderedList,
      Blockquote,
      Placeholder.configure({ placeholder: 'Begin writing… or press / for commands' }),
      Underline,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockExt,
      Link.configure({ openOnClick: false }),
    ],
    editorProps: {
      // Important: include `ProseMirror` so global editor styles apply
      attributes: { class: 'ProseMirror focus:outline-none min-h-[300px]' },
    },
  });

  // Apply font to editor
  useEffect(() => {
    if (!editor) return;
    const el = editor.view.dom as HTMLElement;
    el.style.fontFamily = `'${activeFont.value}', sans-serif`;
  }, [editor, activeFont]);

  // Populate editor when note loads
  useEffect(() => {
    if (!noteData || !editor) return;
    // Only apply top-level metadata when a different note is loaded to avoid
    // overwriting user edits (prevents flicker when editing title).
    const prevId = (noteData as Note).id;
    const prevLoadedId = (noteData as any)?._loadedIdRef;
    if (!noteData || !prevId) return;
    // Use a lightweight ref on the editor DOM to track which note we've loaded
    const el = editor.view.dom as HTMLElement;
    const loadedId = el.dataset.loadedNoteId;
    if (loadedId !== prevId) {
      setTitle(noteData.title || '');
      setTags(noteData.tags || []);
      setColor(noteData.color || null);
      setIsFav(noteData.is_favorite);
      setIsPinned(noteData.is_pinned);
      if (editor.getHTML() !== noteData.content && noteData.content !== lastSavedRef.current) {
        editor.commands.setContent(noteData.content || '');
        lastSavedRef.current = noteData.content || '';
      }
      el.dataset.loadedNoteId = prevId;
    }
  }, [noteData, editor]);

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => notesAPI.update(noteId, data),
    onSuccess: (r) => {
      upsertNote(r.data);
      qc.setQueryData(['note', noteId], r.data);
      lastSavedRef.current = r.data.content;
    },
    onError: () => toast.error('Failed to save note'),
  });

  const content = editor?.getHTML() || '';
  const [debouncedContent] = useDebounce(content, 1200);
  const [debouncedTitle] = useDebounce(title, 800);

  const save = useCallback(() => {
    if (!editor) return;
    const currentContent = editor.getHTML();
    setSaving(true);
    saveMutation.mutate({
      title,
      content: currentContent,
      tags,
      is_favorite: isFav,
      is_pinned: isPinned,
      color,
    }, { onSettled: () => setSaving(false) });
  }, [editor, title, tags, isFav, isPinned, color, saveMutation]);

  useEffect(() => {
    if (debouncedContent && debouncedTitle !== undefined) save();
  }, [debouncedContent, debouncedTitle]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
      if (e.key === 'Escape') setActiveNote(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, setActiveNote]);

  function addTag(t: string) {
    const clean = t.trim().toLowerCase().replace(/\s+/g, '-');
    if (clean && !tags.includes(clean)) {
      const next = [...tags, clean];
      setTags(next);
      saveMutation.mutate({ tags: next });
    }
    setTagInput('');
  }

  function removeTag(t: string) {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    saveMutation.mutate({ tags: next });
  }

  async function handleAITags() {
    if (!title && !editor?.getText()) return;
    try {
      const { data } = await aiAPI.generateTags(title, editor?.getText() || '');
      const merged = [...new Set([...tags, ...data.tags])];
      setTags(merged);
      saveMutation.mutate({ tags: merged });
      toast.success(`Generated ${data.tags.length} tags`);
    } catch { toast.error('AI tag generation failed'); }
  }

  async function handleAITitle() {
    if (!editor?.getText()) return;
    try {
      const { data } = await aiAPI.suggestTitle(editor.getText(), title);
      setTitle(data.title);
      toast.success('Title updated');
    } catch { toast.error('AI title failed'); }
  }

  if (!noteData || !editor) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-panel)' }}>
        <div
          className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--border-accent)', borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col relative"
      style={{ background: 'var(--bg-panel)', borderLeft: '1px solid var(--border)' }}
    >
      {/* Top bar */}
      <div
        className="flex items-center gap-2 px-5 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <button
          onClick={() => setActiveNote(null)}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all text-sm"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          ✕
        </button>
        <div className="flex-1" />

        {/* Saving indicator */}
        <span className="text-xs font-mono" style={{ color: saving ? 'var(--accent)' : 'var(--text-muted)' }}>
          {saving ? '⊙ saving…' : '✓ saved'}
        </span>

        {/* Toolbar buttons */}
        {[
          { label: isFav ? '◆' : '◇', active: isFav, fn: () => { setIsFav(!isFav); saveMutation.mutate({ is_favorite: !isFav }); }, title: 'Favorite' },
          { label: '⊕', active: isPinned, fn: () => { setIsPinned(!isPinned); saveMutation.mutate({ is_pinned: !isPinned }); }, title: 'Pin' },
          { label: '✦', active: aiPanelOpen, fn: () => setAiPanelOpen(!aiPanelOpen), title: 'AI Tools' },
        ].map((b) => (
          <button
            key={b.label}
            onClick={b.fn}
            title={b.title}
            className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all')}
            style={{
              color: b.active ? 'var(--accent)' : 'var(--text-muted)',
              background: b.active ? 'var(--accent-glow)' : 'transparent',
              border: b.active ? '1px solid var(--border-accent)' : '1px solid transparent',
            }}
          >
            {b.label}
          </button>
        ))}

        {/* Font picker */}
        <div className="relative">
          <button
            onClick={() => setFontPickerOpen(!fontPickerOpen)}
            className="h-7 px-2 rounded-lg flex items-center gap-1 transition-all text-xs font-mono"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)', background: 'var(--surface)' }}
            title="Change font"
          >
            Aa
          </button>
          <AnimatePresence>
            {fontPickerOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute right-0 top-9 z-50 py-1.5 rounded-xl w-44"
                style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-accent)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
              >
                {NOTE_FONTS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => { setActiveFont(f); setFontPickerOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm transition-colors"
                    style={{
                      fontFamily: `'${f.value}', sans-serif`,
                      color: activeFont.value === f.value ? 'var(--accent)' : 'var(--text-secondary)',
                      background: activeFont.value === f.value ? 'var(--accent-glow)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (activeFont.value !== f.value) e.currentTarget.style.background = 'var(--surface)'; }}
                    onMouseLeave={e => { if (activeFont.value !== f.value) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {f.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Color picker */}
        <div className="relative">
          <button
            onClick={() => setColorPickerOpen(!colorPickerOpen)}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
            style={{ border: `1px solid ${color || 'var(--border)'}` }}
          >
            <div className="w-3 h-3 rounded-full" style={{ background: color || 'var(--surface-hover)' }} />
          </button>
          <AnimatePresence>
            {colorPickerOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute right-0 top-9 z-50 p-3 rounded-xl flex gap-2 flex-wrap w-44"
                style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-accent)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
              >
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => { setColor(c.value); setColorPickerOpen(false); saveMutation.mutate({ color: c.value }); }}
                    title={c.label}
                    className={cn('w-7 h-7 rounded-full transition-transform hover:scale-110', color === c.value && 'ring-2 ring-white/40 ring-offset-1')}
                    style={{ background: c.value || 'var(--surface-hover)', border: '1px solid var(--border)' }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Accent line */}
      {color && (
        <div
          className="h-0.5 flex-shrink-0"
          style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)`, opacity: 0.7 }}
        />
      )}

      {/* Editor area */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pt-7 pb-4 max-w-[1100px] mx-auto w-full">
            {/* Format toolbar */}
            <FormatToolbar editor={editor} />

            {/* Title — no flickering: controlled input, no re-mount */}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title…"
              className="w-full bg-transparent outline-none font-display font-bold text-3xl mb-5 leading-tight"
              style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
            />

            {/* Editor content */}
            <EditorContent editor={editor} />

            {/* Tags row */}
            <div className="mt-8 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono" style={{ color: 'var(--accent)' }}>TAGS</span>
                {tags.map((t) => (
                  <span key={t} className="tag group cursor-pointer" onClick={() => removeTag(t)}>
                    {t}
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs">✕</span>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                      e.preventDefault(); addTag(tagInput);
                    }
                  }}
                  placeholder="Add tag…"
                  className="bg-transparent outline-none text-xs font-mono"
                  style={{ color: 'var(--text-muted)', caretColor: 'var(--accent)', width: '80px' }}
                />
                <button
                  onClick={handleAITags}
                  className="text-xs font-mono px-2 py-0.5 rounded transition-all"
                  style={{ color: 'var(--accent)', border: '1px solid var(--border-accent)', background: 'var(--accent-glow)' }}
                >
                  ✦ AI tags
                </button>
                <button
                  onClick={handleAITitle}
                  className="text-xs font-mono px-2 py-0.5 rounded transition-all"
                  style={{ color: 'var(--accent)', border: '1px solid var(--border-accent)', background: 'var(--accent-glow)' }}
                >
                  ✦ AI title
                </button>
              </div>
            </div>

            {/* Word count footer */}
            <div className="mt-4 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              {editor.getText().split(/\s+/).filter(Boolean).length} words · {editor.getText().length} chars
            </div>
          </div>
        </div>

        {/* AI Panel */}
        <AnimatePresence>
          {aiPanelOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="flex-shrink-0 overflow-hidden"
            >
              <AIPanel
                note={noteData}
                editorContent={editor.getHTML()}
                onClose={() => setAiPanelOpen(false)}
                onUpdateContent={(c) => editor.commands.setContent(c)}
                onUpdateTags={(t) => { setTags(t); saveMutation.mutate({ tags: t }); }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Format Toolbar ────────────────────────────────────────────────────────────
function FormatToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const activeStyle = {
    background: 'var(--accent-glow)',
    color: 'var(--accent)',
    border: '1px solid var(--border-accent)',
  };
  const inactiveStyle = {
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid transparent',
  };

  const buttons = [
    { label: 'B',  fn: () => editor.chain().focus().toggleBold().run(),         active: editor.isActive('bold'),        title: 'Bold',          style: { fontWeight: 700 } },
    { label: 'I',  fn: () => editor.chain().focus().toggleItalic().run(),       active: editor.isActive('italic'),      title: 'Italic',        style: { fontStyle: 'italic' } },
    { label: 'U',  fn: () => editor.chain().focus().toggleUnderline().run(),    active: editor.isActive('underline'),   title: 'Underline',     style: { textDecoration: 'underline' } },
    { label: '<>', fn: () => editor.chain().focus().toggleCode().run(),          active: editor.isActive('code'),        title: 'Inline code',   style: {} },
    { label: '≡',  fn: () => editor.chain().focus().toggleBulletList().run(),   active: editor.isActive('bulletList'),  title: 'Bullet list',   style: {} },
    { label: '1.', fn: () => editor.chain().focus().toggleOrderedList().run(),  active: editor.isActive('orderedList'), title: 'Numbered list', style: {} },
    { label: '☐',  fn: () => editor.chain().focus().toggleTaskList().run(),     active: editor.isActive('taskList'),    title: 'Task list',     style: {} },
    { label: '"',  fn: () => editor.chain().focus().toggleBlockquote().run(),   active: editor.isActive('blockquote'),  title: 'Quote',         style: {} },
  ];

  // Heading sizes with distinct visual sizes
  const headings: { level: 1 | 2 | 3; size: string; weight: string }[] = [
    { level: 1, size: '1rem',    weight: '800' },
    { level: 2, size: '0.875rem', weight: '700' },
    { level: 3, size: '0.8rem',   weight: '600' },
  ];

  return (
    <div
      className="flex items-center gap-0.5 mb-4 flex-wrap"
      style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}
    >
      {/* Headings with distinct sizes */}
      {headings.map(({ level, size, weight }) => {
        const isActive = editor.isActive('heading', { level });
        return (
          <button
            key={level}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
            title={`Heading ${level}`}
            className="px-2 py-1 rounded text-xs font-display transition-all"
            style={{
              fontSize: size,
              fontWeight: weight,
              ...(isActive ? activeStyle : inactiveStyle),
            }}
          >
            H{level}
          </button>
        );
      })}

      <div className="w-px h-4 mx-1" style={{ background: 'var(--border)' }} />

      {buttons.map((b) => (
        <button
          key={b.label}
          onClick={b.fn}
          title={b.title}
          className="w-7 h-7 rounded flex items-center justify-center text-xs font-mono transition-all"
          style={{ ...(b.active ? activeStyle : inactiveStyle), ...b.style }}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
