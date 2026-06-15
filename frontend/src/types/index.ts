// Nova Notes — TypeScript Types (mirrors backend Pydantic schemas)

// ── Auth ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at?: string;
  email_confirmed?: boolean;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface SignInRequest { email: string; password: string; }
export interface SignUpRequest { email: string; password: string; full_name?: string; }

// ── Notes ─────────────────────────────────────────────────────────────────────
export type NoteStatus = 'active' | 'archived';

export interface Note {
  id: string;
  title: string;
  content: string;
  folder_id?: string | null;
  tags: string[];
  is_favorite: boolean;
  is_pinned: boolean;
  color?: string | null;
  status: NoteStatus;
  word_count: number;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface NoteCreate {
  title?: string;
  content?: string;
  folder_id?: string | null;
  tags?: string[];
  is_favorite?: boolean;
  is_pinned?: boolean;
  color?: string | null;
  status?: NoteStatus;
  generate_ai_tags?: boolean;
  suggest_ai_title?: boolean;
}

export interface NoteUpdate {
  title?: string;
  content?: string;
  folder_id?: string | null;
  tags?: string[];
  is_favorite?: boolean;
  is_pinned?: boolean;
  color?: string | null;
  status?: NoteStatus;
  generate_ai_tags?: boolean;
}

export interface NoteListResponse {
  notes: Note[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

// ── Folders ───────────────────────────────────────────────────────────────────
export interface Folder {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  parent_id?: string | null;
  user_id: string;
  note_count: number;
  created_at: string;
  updated_at: string;
}

export interface FolderCreate {
  name: string;
  color?: string | null;
  icon?: string | null;
  parent_id?: string | null;
}

export interface FolderUpdate {
  name?: string;
  color?: string | null;
  icon?: string | null;
}

// ── Whiteboards ───────────────────────────────────────────────────────────────
export interface Whiteboard {
  id: string;
  title: string;
  canvas_data?: Record<string, unknown> | null;
  note_id?: string | null;
  thumbnail?: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface WhiteboardCreate {
  title?: string;
  canvas_data?: Record<string, unknown> | null;
  note_id?: string | null;
  thumbnail?: string | null;
}

export interface WhiteboardUpdate {
  title?: string;
  canvas_data?: Record<string, unknown> | null;
  thumbnail?: string | null;
}

// ── AI Features ───────────────────────────────────────────────────────────────
export interface AITagsResponse { tags: string[]; }
export interface AITitleResponse { title: string; }
export interface AISummaryResponse { summary: string; }
export interface AIActionItemsResponse { action_items: string[]; }
export interface AIImproveResponse { improved_content: string; }

export interface AIAnalyzeResponse {
  note_id?: string;
  results: {
    tags: string[];
    summary: string;
    action_items: string[];
  };
  errors?: Record<string, string> | null;
}

// ── Chat ──────────────────────────────────────────────────────────────────────
export type ChatMode = 'general' | 'notes';

export interface ChatSource {
  id: string;
  title: string;
  similarity?: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  mode: ChatMode;
  sources?: ChatSource[] | null;
  created_at: string;
}

export interface ChatMessageCreate {
  message: string;
  mode: ChatMode;
  session_id?: string | null;
}

export interface ChatSessionResponse {
  session_id: string;
  messages: ChatMessage[];
  total: number;
}

export interface ChatSessionSummary {
  session_id: string;
  last_message: string;
  mode: ChatMode;
  last_activity: string;
}

// ── Search ────────────────────────────────────────────────────────────────────
export type SearchMode = 'keyword' | 'semantic' | 'hybrid';

export interface SearchRequest {
  query: string;
  mode?: SearchMode;
  folder_id?: string | null;
  tags?: string[] | null;
  limit?: number;
}

export interface SearchResultItem {
  id: string;
  title: string;
  content_preview: string;
  tags: string[];
  folder_id?: string | null;
  is_favorite: boolean;
  similarity_score?: number | null;
  relevance_score?: number | null;
  created_at: string;
  updated_at: string;
}

export interface SearchResponse {
  results: SearchResultItem[];
  total: number;
  query: string;
  mode: SearchMode;
}

// ── App UI State ──────────────────────────────────────────────────────────────
export type ViewMode = 'grid' | 'list';
export type SidebarSection = 'all' | 'favorites' | 'archived' | 'whiteboards' | 'chat' | `folder:${string}` | `tag:${string}`;
