import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { aiAPI } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Note } from '@/types';

interface Props {
  note: Note;
  editorContent: string;
  onClose: () => void;
  onUpdateContent: (c: string) => void;
  onUpdateTags: (t: string[]) => void;
}

type AITask = 'summary' | 'actions' | 'improve' | 'tags';

export function AIPanel({ note, editorContent, onClose, onUpdateContent, onUpdateTags }: Props) {
  const [activeTask, setActiveTask] = useState<AITask | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | string[] | null>(null);
  const [improveInstruction, setImproveInstruction] = useState('');

  async function runTask(task: AITask) {
    setActiveTask(task);
    setLoading(true);
    setResult(null);

    // Strip HTML for plain text
    const plainText = editorContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    try {
      switch (task) {
        case 'summary': {
          const { data } = await aiAPI.summarize(note.title, plainText);
          setResult(data.summary);
          break;
        }
        case 'actions': {
          const { data } = await aiAPI.extractActionItems(note.title, plainText);
          const items = Array.isArray(data.action_items) ? data.action_items : [];
          if (items.length === 0) {
            setResult(['No action items were found in this note.']);
          } else {
            setResult(items);
          }
          break;
        }
        case 'tags': {
          const { data } = await aiAPI.generateTags(note.title, plainText);
          setResult(data.tags);
          onUpdateTags([...new Set([...note.tags, ...data.tags])]);
          toast.success(`Added ${data.tags.length} AI tags`);
          break;
        }
        case 'improve': {
          if (!improveInstruction.trim()) { toast.error('Enter an instruction first'); setLoading(false); return; }
          const { data } = await aiAPI.improve(note.title, plainText, improveInstruction);
          setResult(data.improved_content);
          break;
        }
      }
    } catch (e) {
      toast.error('AI request failed');
    } finally {
      setLoading(false);
    }
  }

  const taskButtons = [
    { id: 'summary' as AITask, icon: '◈', label: 'Summarize' },
    { id: 'actions' as AITask, icon: '☐', label: 'Action Items' },
    { id: 'tags' as AITask, icon: '⊞', label: 'AI Tags' },
    { id: 'improve' as AITask, icon: '✦', label: 'Improve' },
  ];

  return (
    <div className="h-full flex flex-col"
      style={{ borderLeft: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--accent)' }}>✦</span>
          <span className="font-display text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>AI Tools</span>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 text-xs transition-colors">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Task buttons */}
        <div className="grid grid-cols-2 gap-2">
          {taskButtons.map((b) => (
            <button key={b.id} onClick={() => runTask(b.id)}
              disabled={loading}
              className={cn('p-3 rounded-xl text-left transition-all',
                activeTask === b.id ? 'border-cyan-300/30 bg-cyan-300/08' : 'hover:bg-white/3',
                loading && activeTask === b.id && 'opacity-70')}
              style={{
                background: activeTask === b.id ? 'var(--accent-glow)' : 'var(--surface)',
                border: `1px solid ${activeTask === b.id ? 'var(--border-accent)' : 'var(--border)'}`,
              }}>
              <div className="text-base mb-1" style={{ color: activeTask === b.id ? 'var(--accent)' : 'var(--text-muted)' }}>{b.icon}</div>
              <div className="text-xs font-display font-medium" style={{ color: activeTask === b.id ? 'var(--accent)' : 'var(--text-secondary)' }}>{b.label}</div>
            </button>
          ))}
        </div>

        {/* Improve instruction */}
        {activeTask === 'improve' && (
          <div className="space-y-2">
            <input value={improveInstruction} onChange={(e) => setImproveInstruction(e.target.value)}
              placeholder="e.g. Make it more formal, fix grammar…"
              className="input-void text-xs"
              onKeyDown={(e) => { if (e.key === 'Enter') runTask('improve'); }} />
            <button onClick={() => runTask('improve')} className="btn-primary w-full text-xs py-2">
              Apply Improvement
            </button>
          </div>
        )}

        {/* Loading */}
        <AnimatePresence>
          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-3 p-4 rounded-xl"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="w-4 h-4 border-2 border-cyan-300/30 border-t-cyan-300 rounded-full animate-spin flex-shrink-0" />
              <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                AI is analyzing…
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence mode="wait">
          {result && !loading && (
            <motion.div key={activeTask} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono uppercase" style={{ color: 'var(--text-muted)' }}>
                  {activeTask === 'summary' ? 'Summary' : activeTask === 'actions' ? 'Action Items' : activeTask === 'tags' ? 'Tags Added' : 'Improved Content'}
                </span>
                {activeTask === 'improve' && typeof result === 'string' && (
                  <button onClick={() => { onUpdateContent(result); toast.success('Content updated!'); }}
                    className="text-xs btn-futuristic py-1 px-3">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>Apply</span>
                      <span style={{ fontSize: '0.85em' }}>⌁</span>
                    </span>
                  </button>
                )}
              </div>

              {Array.isArray(result) ? (
                <ul className="space-y-2">
                  {result.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs font-body" style={{ color: 'var(--text-primary)' }}>
                      <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }}>
                        {activeTask === 'actions' ? '☐' : '◆'}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs font-body leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                  {result}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Analyze all */}
        <button onClick={async () => {
          setLoading(true);
          const plainText = editorContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          try {
            const { data } = await aiAPI.analyze(note.title, plainText, note.id);
            onUpdateTags([...new Set([...note.tags, ...data.results.tags])]);
            setActiveTask('summary');
            setResult(data.results.summary);
            toast.success('Full analysis complete!');
          } catch { toast.error('Analysis failed'); }
          finally { setLoading(false); }
        }} disabled={loading}
          className="w-full py-2.5 rounded-xl text-xs font-display font-semibold transition-all"
          style={{ background: 'var(--accent-glow)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          ✦ Full AI Analysis
        </button>
      </div>
    </div>
  );
}
