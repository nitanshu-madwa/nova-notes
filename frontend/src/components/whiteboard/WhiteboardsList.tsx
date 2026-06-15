import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { whiteboardsAPI } from '@/lib/api';
import { formatNoteDate, cn } from '@/lib/utils';
import type { Whiteboard } from '@/types';
import toast from 'react-hot-toast';

export function WhiteboardsList() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['whiteboards'],
    queryFn: () => whiteboardsAPI.list().then(r => r.data),
  });

  const whiteboards: Whiteboard[] = data?.whiteboards ?? data ?? [];

  const createMutation = useMutation({
    mutationFn: (title: string) => whiteboardsAPI.create({ title }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['whiteboards'] });
      setCreating(false);
      setNewTitle('');
      setActiveId(res.data?.id ?? null);
      toast.success('Whiteboard created');
    },
    onError: () => toast.error('Failed to create whiteboard'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => whiteboardsAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whiteboards'] });
      setActiveId(null);
      toast.success('Deleted');
    },
  });

  function handleCreate() {
    const title = newTitle.trim() || 'Untitled Whiteboard';
    createMutation.mutate(title);
  }

  if (activeId) {
    return <WhiteboardCanvas id={activeId} onBack={() => setActiveId(null)} />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <h2 className="text-lg font-display" style={{ color: 'var(--text-primary)' }}>Whiteboards</h2>
          <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {whiteboards.length} canvas{whiteboards.length !== 1 ? 'es' : ''}
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-body transition-all btn-primary"
        >
          + New
        </button>
      </div>

      {/* New whiteboard input */}
      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-6 overflow-hidden"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="py-3 flex gap-2">
              <input
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
                placeholder="Whiteboard title…"
                className="flex-1 input-void text-sm"
              />
              <button onClick={handleCreate} className="btn-primary px-3 py-2 text-sm">Create</button>
              <button onClick={() => setCreating(false)} className="btn-ghost px-3 py-2 text-sm">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: 'var(--border-accent)', borderTopColor: 'transparent' }} />
          </div>
        ) : whiteboards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="text-4xl opacity-20">◻</div>
            <p className="text-sm font-body" style={{ color: 'var(--text-muted)' }}>No whiteboards yet</p>
            <button onClick={() => setCreating(true)} className="btn-primary text-sm px-4 py-2 rounded-xl">
              Create your first whiteboard
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {whiteboards.map((wb) => (
              <motion.div
                key={wb.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="group glow-card p-4 cursor-pointer"
                onClick={() => setActiveId(wb.id)}
              >
                {/* Preview area */}
                <div
                  className="w-full h-24 rounded-xl mb-3 flex items-center justify-center"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <span className="text-2xl opacity-20">◻</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-body truncate" style={{ color: 'var(--text-primary)' }}>
                      {wb.title || 'Untitled'}
                    </p>
                    <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {formatNoteDate(wb.updated_at)}
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); deleteMutation.mutate(wb.id); }}
                    className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 rounded-lg transition-all"
                    style={{ color: 'var(--plasma)', background: 'rgba(244,114,182,0.08)', border: '1px solid rgba(244,114,182,0.2)' }}
                  >
                    ✕
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tool definitions ────────────────────────────────────────────────────────

type ToolId = 'pen' | 'pencil' | 'brush' | 'eraser-sm' | 'eraser-md' | 'eraser-lg';

interface Tool {
  id: ToolId;
  label: string;
  icon: string;
  group: 'draw' | 'erase';
  eraserSize?: number;
}

const TOOLS: Tool[] = [
  { id: 'pen',       label: 'Pen',      icon: '✒️', group: 'draw' },
  { id: 'pencil',    label: 'Pencil',   icon: '✏️', group: 'draw' },
  { id: 'brush',     label: 'Brush',    icon: '🖌️', group: 'draw' },
  { id: 'eraser-sm', label: 'S Erase',  icon: '◌',  group: 'erase', eraserSize: 10 },
  { id: 'eraser-md', label: 'M Erase',  icon: '○',  group: 'erase', eraserSize: 24 },
  { id: 'eraser-lg', label: 'L Erase',  icon: '◯',  group: 'erase', eraserSize: 48 },
];

const COLORS = [
  '#7b8cff', '#a78bfa', '#34d399', '#f472b6',
  '#fbbf24', '#f87171', '#38bdf8', '#ffffff', '#000000',
];

const BG_PRESETS = [
  { value: '#0d0f14', label: 'Void' },
  { value: '#0b132b', label: 'Space' },
  { value: '#081c15', label: 'Forest' },
  { value: '#1a0a0a', label: 'Ember' },
  { value: '#150a1a', label: 'Cyber' },
  { value: '#f8f9fa', label: 'Paper' },
  { value: '#fffde7', label: 'Cream' },
];

// ── Inline canvas component ─────────────────────────────────────────────────

function WhiteboardCanvas({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<ToolId>('pen');
  const [color, setColor] = useState('#7b8cff');
  const [size, setSize] = useState(4);
  const [bgColor, setBgColor] = useState(() => localStorage.getItem(`wb_bg_${id}`) || '#0d0f14');
  const [customBg, setCustomBg] = useState('');
  const isDrawing = useRef(false);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastPos = useRef({ x: 0, y: 0 });

  const { data } = useQuery({
    queryKey: ['whiteboard', id],
    queryFn: () => whiteboardsAPI.get(id).then(r => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (canvas_data: string) => whiteboardsAPI.update(id, { canvas_data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whiteboards'] }),
  });

  const isLoaded = useRef(false);

  // Init canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctxRef.current = ctx;

    if (data && !isLoaded.current) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (data.canvas_data) {
        const img = new Image();
        img.onload = () => { ctx.drawImage(img, 0, 0); };
        img.src = data.canvas_data;
      }
      isLoaded.current = true;
    }
  }, [data]);

  function hexToRGBA(hex: string, alpha: number) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      if (e.touches.length === 0) return lastPos.current;
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as React.MouseEvent).clientY - rect.top) * scaleY,
    };
  }

  function getActiveTool() {
    return TOOLS.find(t => t.id === tool)!;
  }

  function configureStroke(ctx: CanvasRenderingContext2D) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const active = getActiveTool();

    if (active.group === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = active.eraserSize!;
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      if (tool === 'pencil') {
        // Textured, sketchy pencil
        ctx.strokeStyle = hexToRGBA(color, 0.5);
        ctx.lineWidth = Math.max(1, size * 0.7);
      } else if (tool === 'brush') {
        // Wide, soft brush
        ctx.strokeStyle = hexToRGBA(color, 0.28);
        ctx.lineWidth = size * 4;
      } else {
        // Clean pen
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
      }
    }
  }

  function drawPencilTexture(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }) {
    // Extra scribble lines to simulate pencil grain
    for (let i = 0; i < 3; i++) {
      const jitter = () => (Math.random() - 0.5) * size * 1.5;
      ctx.beginPath();
      ctx.moveTo(from.x + jitter(), from.y + jitter());
      ctx.lineTo(to.x + jitter(), to.y + jitter());
      ctx.strokeStyle = hexToRGBA(color, 0.12);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = ctxRef.current;
    if (!ctx) return;

    isDrawing.current = true;
    const pos = getPos(e, canvas);
    lastPos.current = pos;

    ctx.beginPath();
    configureStroke(ctx);

    // Paint a dot at start
    const r = ctx.lineWidth / 2;
    if (getActiveTool().group === 'erase') {
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = (ctx.strokeStyle as string);
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = ctxRef.current;
    if (!ctx) return;

    const pos = getPos(e, canvas);

    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    configureStroke(ctx);
    ctx.stroke();

    // Pencil grain
    if (tool === 'pencil') {
      drawPencilTexture(ctx, lastPos.current, pos);
    }

    lastPos.current = pos;
  }

  function stopDraw() {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    saveMutation.mutate(canvas.toDataURL());
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveMutation.mutate(canvas.toDataURL());
  }

  function applyBg(val: string) {
    setBgColor(val);
    localStorage.setItem(`wb_bg_${id}`, val);
  }

  const isEraser = getActiveTool().group === 'erase';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-2 flex-shrink-0 flex-wrap"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}
      >
        <button
          onClick={onBack}
          className="text-sm font-mono px-3 py-1.5 rounded-lg transition-all btn-ghost"
        >
          ← Back
        </button>
        <span className="text-sm font-body truncate max-w-36" style={{ color: 'var(--text-secondary)' }}>
          {data?.title || 'Whiteboard'}
        </span>

        {/* Drawing tools */}
        <div className="flex gap-1 ml-1">
          {TOOLS.filter(t => t.group === 'draw').map(t => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={t.label}
              className="px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all"
              style={{
                background: tool === t.id ? 'var(--accent-glow)' : 'var(--surface)',
                border: `1px solid ${tool === t.id ? 'var(--border-accent)' : 'var(--border)'}`,
                color: tool === t.id ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Eraser tools */}
        <div className="flex gap-1">
          {TOOLS.filter(t => t.group === 'erase').map(t => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={`Eraser ${t.label}`}
              className="px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all"
              style={{
                background: tool === t.id ? 'rgba(244,114,182,0.12)' : 'var(--surface)',
                border: `1px solid ${tool === t.id ? 'rgba(244,114,182,0.4)' : 'var(--border)'}`,
                color: tool === t.id ? 'var(--plasma)' : 'var(--text-muted)',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Colors */}
        <div className="flex gap-1.5 items-center">
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Ink</span>
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => { setColor(c); if (isEraser) setTool('pen'); }}
              title={c}
              className="w-5 h-5 rounded-full transition-all hover:scale-110"
              style={{
                background: c,
                outline: color === c && !isEraser ? `2px solid ${c}` : 'none',
                outlineOffset: '2px',
                opacity: isEraser ? 0.35 : 1,
                border: c === '#ffffff' ? '1px solid rgba(0,0,0,0.2)' : 'none',
              }}
            />
          ))}
          {/* Custom color */}
          <input
            type="color"
            value={color}
            onChange={e => { setColor(e.target.value); if (isEraser) setTool('pen'); }}
            title="Custom color"
            className="w-5 h-5 rounded-full cursor-pointer border-0 p-0"
            style={{ background: 'none' }}
          />
        </div>

        {/* Brush/pen size */}
        {!isEraser && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Size</span>
            <input
              type="range" min={1} max={30} value={size}
              onChange={e => setSize(+e.target.value)}
              className="w-16"
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="text-xs font-mono w-4" style={{ color: 'var(--text-muted)' }}>{size}</span>
          </div>
        )}

        {/* Canvas BG */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Canvas</span>
          {BG_PRESETS.map(bg => (
            <button
              key={bg.value}
              onClick={() => applyBg(bg.value)}
              title={bg.label}
              className="w-5 h-5 rounded transition-all hover:scale-110"
              style={{
                background: bg.value,
                outline: bgColor === bg.value ? '2px solid var(--accent)' : 'none',
                outlineOffset: '2px',
                border: '1px solid var(--border)',
              }}
            />
          ))}
          <input
            type="color"
            value={customBg || bgColor}
            onChange={e => { setCustomBg(e.target.value); applyBg(e.target.value); }}
            title="Custom canvas color"
            className="w-5 h-5 cursor-pointer border-0 p-0 rounded"
            style={{ background: 'none' }}
          />
        </div>

        <button
          onClick={clearCanvas}
          className="ml-auto text-xs font-mono px-3 py-1.5 rounded-lg btn-danger"
        >
          Clear
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={1600}
          height={900}
          className="w-full h-full"
          style={{
            cursor: isEraser ? 'cell' : tool === 'brush' ? 'crosshair' : 'crosshair',
            touchAction: 'none',
            backgroundColor: bgColor,
            transition: 'background-color 0.3s ease',
          }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
      </div>
    </div>
  );
}
