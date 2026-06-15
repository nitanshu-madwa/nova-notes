import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { chatAPI } from '@/lib/api';
import { cn, generateId, formatNoteDate } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';
import type { ChatMessage, ChatMode } from '@/types';

const THINKING_STAGES = [
  'Thinking…',
  'Analysing context…',
  'Processing…',
  'Composing response…',
];

function ThinkingIndicator() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStage(s => (s + 1) % THINKING_STAGES.length), 900);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="flex items-center gap-3"
    >
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 font-bold"
        style={{ background: 'var(--accent-glow)', border: '1px solid var(--border-accent)', color: 'var(--accent)', fontFamily: "'Syne', sans-serif" }}
      >N</div>
      <div
        className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div className="flex gap-1.5">
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </div>
        <motion.span
          key={stage}
          initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
          className="text-xs font-mono"
          style={{ color: 'var(--text-muted)' }}
        >
          {THINKING_STAGES[stage]}
        </motion.span>
      </div>
    </motion.div>
  );
}

// ── Streaming text renderer — shows text word by word ─────────────────────────
function StreamingText({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code: ({ className, children, ...props }) => (
          <code
            className={cn(className, 'font-mono px-1 py-0.5 rounded text-xs')}
            style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}
            {...props}
          >{children}</code>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener"
            style={{ color: 'var(--accent)', textDecoration: 'underline', textDecorationColor: 'var(--border-accent)' }}
          >{children}</a>
        ),
      }}
    >
      {content || ' '}
    </ReactMarkdown>
  );
}

// ── Nova logo mark ─────────────────────────────────────────────────────────────
function NovaMark({ size = 20 }: { size?: number }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: 'var(--accent-glow)', border: '1px solid var(--border-accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--accent)',
        fontFamily: "'Syne', sans-serif", fontWeight: 800,
        fontSize: size * 0.52, lineHeight: 1,
      }}
    >N</div>
  );
}

export function ChatPanel() {
  const { setChatOpen, chatMode, setChatMode, chatSessionId, setChatSessionId } = useAppStore();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (chatSessionId) {
      chatAPI.getSession(chatSessionId).then((r) => {
        setMessages(r.data.messages || []);
      }).catch(() => {});
    } else {
      setMessages([]);
    }
  }, [chatSessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  async function handleSend() {
    if (!input.trim() || streaming) return;
    const msg = input.trim();
    setInput('');

    const userMsgId = generateId();
    const tempUserMsg: ChatMessage = {
      id: userMsgId, session_id: chatSessionId || '',
      role: 'user', content: msg, mode: chatMode,
      created_at: new Date().toISOString(),
    };

    const assistantMsgId = generateId();
    const tempAssistantMsg: ChatMessage = {
      id: assistantMsgId, session_id: chatSessionId || '',
      role: 'assistant', content: '', mode: chatMode,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setThinking(true);
    setStreaming(true);

    try {
      const response = await chatAPI.sendMessageStream({ message: msg, mode: chatMode, session_id: chatSessionId });

      // Fallback path: non-streaming response returned as an object
      if ((response as any).fallback) {
        const { data } = (response as any);
        console.debug('Chat fallback used — non-streaming response:', data);
        toast.success('Received non-streaming chat reply');
        const finalId = data.id || generateId();
        const finalContent = data.content || '';
        const newSessionId = data.session_id || chatSessionId;
        if (!chatSessionId && newSessionId) setChatSessionId(newSessionId);
        setThinking(false);
        setStreaming(false);
        setStreamingMsgId(null);
        setMessages((prev) => {
          const updated = [...prev];
          // Append assistant final message
          updated.push({ id: finalId, session_id: newSessionId || '', role: 'assistant', content: finalContent, mode: chatMode, created_at: new Date().toISOString(), sources: data.sources || null });
          return updated;
        });
        qc.invalidateQueries({ queryKey: ['chat-sessions'] });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body reader');

      const decoder = new TextDecoder();
      let buffer = '';
      let firstChunk = true;
      let pendingMetadata: { session_id?: string; sources?: any } = {};

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(jsonStr);
            const { event, data } = parsed;
            console.debug('SSE parsed event:', event, data ? (typeof data === 'object' ? data : String(data).slice(0,120)) : null);

            if (event === 'metadata') {
              const { session_id: newSessionId, sources } = data || {};
              if (newSessionId) {
                pendingMetadata.session_id = newSessionId;
                pendingMetadata.sources = sources;
              }
              if (!chatSessionId && newSessionId) setChatSessionId(newSessionId);
              setMessages((prev) => {
                const lastIdx = prev.length - 1;
                if (lastIdx >= 0 && prev[lastIdx].role === 'assistant') {
                  const updated = [...prev];
                  updated[lastIdx] = { ...prev[lastIdx], session_id: newSessionId, sources };
                  return updated;
                }
                return prev;
              });
            } else if (event === 'content') {
              if (firstChunk) {
                setThinking(false);
                setStreamingMsgId(assistantMsgId);
                const assistMsg = {
                  ...tempAssistantMsg,
                  session_id: pendingMetadata.session_id || tempAssistantMsg.session_id,
                  sources: pendingMetadata.sources || tempAssistantMsg.sources,
                };
                setMessages((prev) => [...prev, assistMsg]);
                firstChunk = false;
              }
              setMessages((prev) => {
                const lastIdx = prev.length - 1;
                if (lastIdx >= 0 && prev[lastIdx].role === 'assistant') {
                  const updated = [...prev];
                  updated[lastIdx] = { ...prev[lastIdx], content: prev[lastIdx].content + data };
                  return updated;
                }
                return prev;
              });
            } else if (event === 'done') {
              const { id: finalId, content: finalContent } = data;
              setThinking(false);
              if (firstChunk) {
                const assistant = {
                  ...tempAssistantMsg,
                  id: finalId,
                  content: finalContent,
                  session_id: pendingMetadata.session_id || tempAssistantMsg.session_id,
                  sources: pendingMetadata.sources || tempAssistantMsg.sources,
                };
                setMessages((prev) => [...prev, assistant]);
              } else {
                setMessages((prev) => {
                  const lastIdx = prev.length - 1;
                  if (lastIdx >= 0 && prev[lastIdx].role === 'assistant') {
                    const updated = [...prev];
                    updated[lastIdx] = {
                      ...prev[lastIdx],
                      id: finalId,
                      content: finalContent,
                      session_id: pendingMetadata.session_id || prev[lastIdx].session_id,
                      sources: pendingMetadata.sources || prev[lastIdx].sources,
                    };
                    return updated;
                  }
                  return prev;
                });
              }
              setStreaming(false);
              setStreamingMsgId(null);
              qc.invalidateQueries({ queryKey: ['chat-sessions'] });
            }
          } catch (err) {
            console.error('Error parsing SSE chunk:', err);
          }
        }

        if (done) {
          if (buffer.trim()) {
            const trailingLines = buffer.split('\n');
            for (const line of trailingLines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;
              const jsonStr = trimmed.slice(6);
              try {
                const parsed = JSON.parse(jsonStr);
                const { event, data } = parsed;
                if (event === 'metadata') {
                  const { session_id: newSessionId, sources } = data;
                  if (!chatSessionId) setChatSessionId(newSessionId);
                  setMessages((prev) => {
                    const lastIdx = prev.length - 1;
                    if (lastIdx >= 0 && prev[lastIdx].role === 'assistant') {
                      const updated = [...prev];
                      updated[lastIdx] = { ...prev[lastIdx], session_id: newSessionId, sources };
                      return updated;
                    }
                    return prev;
                  });
                } else if (event === 'content') {
                  if (firstChunk) {
                    setThinking(false);
                    setStreamingMsgId(assistantMsgId);
                    const assistMsg = {
                      ...tempAssistantMsg,
                      session_id: pendingMetadata.session_id || tempAssistantMsg.session_id,
                      sources: pendingMetadata.sources || tempAssistantMsg.sources,
                    };
                    setMessages((prev) => [...prev, assistMsg]);
                    firstChunk = false;
                  }
                  setMessages((prev) => {
                    const lastIdx = prev.length - 1;
                    if (lastIdx >= 0 && prev[lastIdx].role === 'assistant') {
                      const updated = [...prev];
                      updated[lastIdx] = { ...prev[lastIdx], content: prev[lastIdx].content + data };
                      return updated;
                    }
                    return prev;
                  });
                } else if (event === 'done') {
                  const { id: finalId, content: finalContent } = data;
                  setThinking(false);
                  if (firstChunk) {
                    const assistant = {
                      ...tempAssistantMsg,
                      id: finalId,
                      content: finalContent,
                      session_id: pendingMetadata.session_id || tempAssistantMsg.session_id,
                      sources: pendingMetadata.sources || tempAssistantMsg.sources,
                    };
                    setMessages((prev) => [...prev, assistant]);
                  } else {
                    setMessages((prev) => {
                      const lastIdx = prev.length - 1;
                      if (lastIdx >= 0 && prev[lastIdx].role === 'assistant') {
                        const updated = [...prev];
                        updated[lastIdx] = {
                          ...updated[lastIdx],
                          id: finalId,
                          content: finalContent,
                          session_id: pendingMetadata.session_id || updated[lastIdx].session_id,
                          sources: pendingMetadata.sources || updated[lastIdx].sources,
                        };
                        return updated;
                      }
                      return prev;
                    });
                  }
                  setStreaming(false);
                  setStreamingMsgId(null);
                  qc.invalidateQueries({ queryKey: ['chat-sessions'] });
                }
              } catch (err) {
                console.error('Error parsing trailing SSE chunk:', err);
              }
            }
          }
          break;
        }
      }
    } catch (err) {
      setStreaming(false);
      setThinking(false);
      setStreamingMsgId(null);
      toast.error('Chat failed — check your connection');
      setMessages((prev) => {
        const lastIdx = prev.length - 1;
        if (lastIdx >= 0 && prev[lastIdx].role === 'assistant') {
          const updated = [...prev];
          updated[lastIdx] = { ...prev[lastIdx], content: prev[lastIdx].content || 'I encountered an error. Please try again.' };
          return updated;
        }
        return prev;
      });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function resetConversation() {
    setChatSessionId(null);
    setMessages([]);
    setInput('');
    setThinking(false);
    setStreaming(false);
    setStreamingMsgId(null);
    toast.success('Conversation reset');
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-panel)', borderLeft: '1px solid var(--border)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}
      >
        <div className="flex items-center gap-2 flex-1">
          <NovaMark size={28} />
          <div>
            <div className="font-display text-sm font-bold" style={{ color: 'var(--accent)' }}>Nova AI</div>
            <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              Nova AI assistant
            </div>
          </div>
        </div>
        <button
          onClick={resetConversation}
          disabled={messages.length === 0}
          title="Reset conversation"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all"
          style={{
            color: messages.length > 0 ? 'var(--plasma)' : 'var(--text-muted)',
            background: messages.length > 0 ? 'rgba(251,113,133,0.07)' : 'transparent',
            border: `1px solid ${messages.length > 0 ? 'rgba(251,113,133,0.2)' : 'var(--border)'}`,
            opacity: messages.length === 0 ? 0.4 : 1,
            cursor: messages.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >↺ Reset</button>
        <button
          onClick={() => setChatOpen(false)}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all text-xs"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >✕</button>
      </div>

      {/* Mode selector */}
      <div className="flex gap-2 px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        {([['general', '◈ General'], ['notes', '⊞ My Notes']] as [ChatMode, string][]).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setChatMode(m)}
            className="flex-1 py-1.5 rounded-lg text-xs font-display font-medium transition-all"
            style={{
              background: chatMode === m ? 'var(--accent-glow)' : 'transparent',
              border: `1px solid ${chatMode === m ? 'var(--border-accent)' : 'var(--border)'}`,
              color: chatMode === m ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >{label}</button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !thinking && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-10">
            <div className="text-4xl mb-4 animate-float" style={{ color: 'var(--accent)' }}>
              <NovaMark size={40} />
            </div>
            <h3 className="font-display text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
              {chatMode === 'notes' ? 'Chat with Your Notes' : 'Nova AI Assistant'}
            </h3>
            <p className="text-xs font-body" style={{ color: 'var(--text-muted)' }}>
              {chatMode === 'notes'
                ? "Ask anything about your notes. I'll search semantically and answer."
                : "Ask me anything. I'm here to help."}
            </p>
            <div className="mt-5 space-y-2">
              {(chatMode === 'notes'
                ? ['What are my most recent ideas?', 'Summarize my meeting notes', 'Find notes about project planning']
                : ['Help me write a summary', 'Explain a concept', 'Brainstorm ideas for…']
              ).map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                  className="w-full text-left text-xs font-body px-3 py-2.5 rounded-xl transition-all"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--surface)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-glow)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--surface)'; }}
                >{prompt}</button>
              ))}
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div className="max-w-[92%]">
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <NovaMark size={18} />
                    <span className="text-xs font-mono" style={{ color: 'var(--accent)' }}>Nova</span>
                  </div>
                )}

                <div className={cn('px-3.5 py-2.5', msg.role === 'user' ? 'chat-message-user' : 'chat-message-ai')}>
                  {msg.role === 'user' ? (
                    <p className="text-sm font-body" style={{ color: 'var(--text-primary)' }}>{msg.content}</p>
                  ) : (
                    <div className="text-sm font-body prose-invert prose-sm max-w-none" style={{ color: 'var(--text-primary)' }}>
                      <StreamingText content={msg.content} />
                    </div>
                  )}
                </div>

                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {msg.sources.map((s) => (
                      <span key={s.id} className="text-xs font-mono px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.18)', color: 'rgba(52,211,153,0.75)' }}>
                        ◈ {s.title}
                      </span>
                    ))}
                  </div>
                )}

                <div className="text-xs font-mono mt-1.5"
                  style={{ color: 'var(--text-muted)', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                  {formatNoteDate(msg.created_at)}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <AnimatePresence>{thinking && <ThinkingIndicator />}</AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 flex-shrink-0">
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-accent)', boxShadow: '0 0 14px var(--accent-glow)' }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={chatMode === 'notes' ? 'Ask about your notes…' : 'Ask anything…'}
            rows={1}
            className="w-full bg-transparent px-4 pt-3 pb-10 text-sm font-body outline-none resize-none"
            style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)', minHeight: '52px', maxHeight: '150px' }}
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-2">
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>↵ send</span>
            <button
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
              style={{
                background: input.trim() && !streaming ? 'linear-gradient(135deg, rgba(129,140,248,0.22), rgba(165,180,252,0.22))' : 'var(--surface)',
                border: `1px solid ${input.trim() && !streaming ? 'var(--border-accent)' : 'var(--border)'}`,
                color: input.trim() && !streaming ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >→</button>
          </div>
        </div>
      </div>
    </div>
  );
}
