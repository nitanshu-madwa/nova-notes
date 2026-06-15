import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNoteDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return `Today ${format(d, 'h:mm a')}`;
  if (isYesterday(d)) return 'Yesterday';
  return formatDistanceToNow(d, { addSuffix: true });
}

export function truncate(text: string, len: number): string {
  if (!text) return '';
  const stripped = text.replace(/#{1,6}\s/g, '').replace(/\*{1,2}/g, '').replace(/`/g, '').replace(/\n+/g, ' ').trim();
  return stripped.length > len ? stripped.slice(0, len) + '…' : stripped;
}

export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const NOTE_COLORS = [
  { label: 'Cyan', value: '#00f5ff' },
  { label: 'Violet', value: '#7c3aed' },
  { label: 'Plasma', value: '#ff006e' },
  { label: 'Aurora', value: '#00ff87' },
  { label: 'Gold', value: '#f59e0b' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'None', value: null },
] as const;

export const FOLDER_ICONS = ['📁', '📝', '💡', '🚀', '⚡', '🎯', '🔬', '💎', '🌊', '🔥', '🌿', '⭐'];

export function getErrorMessage(error: unknown): string {
  // Prefer API error body over axios generic "Request failed with status code 400"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detail = (error as any)?.response?.data?.detail;
  if (detail) return typeof detail === 'string' ? detail : JSON.stringify(detail);

  if (error instanceof Error) {
    const msg = error.message;
    if (msg && !/^Request failed with status code \d+$/i.test(msg)) return msg;
  }
  return 'An unexpected error occurred';
}
