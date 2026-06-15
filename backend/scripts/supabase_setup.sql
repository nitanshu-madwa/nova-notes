-- Nova Notes - Complete Supabase Database Setup
-- pgvector for semantic/vector search

-- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Full-text search (usually enabled by default)
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ── Step 2: Create Tables ────────────────────────────────────

-- Folders table
CREATE TABLE IF NOT EXISTS public.folders (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT,                        -- Hex color e.g. #6366f1
    icon        TEXT DEFAULT '📁',          -- Emoji icon
    parent_id   UUID REFERENCES public.folders(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notes table with vector embedding
CREATE TABLE IF NOT EXISTS public.notes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    folder_id   UUID REFERENCES public.folders(id) ON DELETE SET NULL,
    title       TEXT NOT NULL DEFAULT 'Untitled Note',
    content     TEXT NOT NULL DEFAULT '',
    tags        TEXT[] DEFAULT '{}',
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    is_pinned   BOOLEAN NOT NULL DEFAULT FALSE,
    color       TEXT,                        -- Note accent color
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    word_count  INTEGER NOT NULL DEFAULT 0,
    embedding   vector(384),                 -- all-MiniLM-L6-v2 dimension
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Whiteboards table
CREATE TABLE IF NOT EXISTS public.whiteboards (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    note_id     UUID REFERENCES public.notes(id) ON DELETE SET NULL,
    title       TEXT NOT NULL DEFAULT 'Untitled Whiteboard',
    canvas_data JSONB DEFAULT '{"version": "1.0", "objects": []}',
    thumbnail   TEXT,                        -- Base64 thumbnail image
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI Chat messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id  UUID NOT NULL,               -- Groups messages into conversations
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    mode        TEXT NOT NULL DEFAULT 'general' CHECK (mode IN ('general', 'notes')),
    sources     JSONB,                       -- Notes used as RAG context
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── Step 3: Create Indexes ────────────────────────────────────

-- Notes indexes
CREATE INDEX IF NOT EXISTS idx_notes_user_id     ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_folder_id   ON public.notes(folder_id);
CREATE INDEX IF NOT EXISTS idx_notes_status      ON public.notes(status);
CREATE INDEX IF NOT EXISTS idx_notes_is_favorite ON public.notes(is_favorite);
CREATE INDEX IF NOT EXISTS idx_notes_is_pinned   ON public.notes(is_pinned);
CREATE INDEX IF NOT EXISTS idx_notes_tags        ON public.notes USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at  ON public.notes(updated_at DESC);

-- Full-text search index on title + content
CREATE INDEX IF NOT EXISTS idx_notes_fts ON public.notes
    USING GIN(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')));

-- Vector similarity index (IVFFlat for approximate nearest neighbor)
-- NOTE: Only create this after inserting at least a few records with embeddings
-- If you get an error, run it after inserting some data, or use HNSW below
CREATE INDEX IF NOT EXISTS idx_notes_embedding ON public.notes
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Alternative HNSW index (better accuracy, slightly slower to build):
-- CREATE INDEX IF NOT EXISTS idx_notes_embedding_hnsw ON public.notes
--     USING hnsw (embedding vector_cosine_ops)
--     WITH (m = 16, ef_construction = 64);

-- Folders indexes
CREATE INDEX IF NOT EXISTS idx_folders_user_id   ON public.folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON public.folders(parent_id);

-- Whiteboards indexes
CREATE INDEX IF NOT EXISTS idx_whiteboards_user_id ON public.whiteboards(user_id);
CREATE INDEX IF NOT EXISTS idx_whiteboards_note_id ON public.whiteboards(note_id);

-- Chat messages indexes
CREATE INDEX IF NOT EXISTS idx_chat_user_id    ON public.chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_session_id ON public.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_created_at ON public.chat_messages(created_at DESC);


-- ── Step 4: Auto-update updated_at Trigger ───────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_notes_updated_at
    BEFORE UPDATE ON public.notes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trigger_folders_updated_at
    BEFORE UPDATE ON public.folders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trigger_whiteboards_updated_at
    BEFORE UPDATE ON public.whiteboards
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── Step 5: Vector Search RPC Function ───────────────────────

-- This function is called by the backend for semantic search
CREATE OR REPLACE FUNCTION public.match_notes(
    query_embedding     vector(384),
    match_threshold     FLOAT DEFAULT 0.7,
    match_count         INT   DEFAULT 10,
    filter_user_id      UUID  DEFAULT NULL,
    filter_folder_id    UUID  DEFAULT NULL
)
RETURNS TABLE (
    id          UUID,
    title       TEXT,
    content     TEXT,
    tags        TEXT[],
    folder_id   UUID,
    is_favorite BOOLEAN,
    status      TEXT,
    created_at  TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ,
    similarity  FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.id,
        n.title,
        n.content,
        n.tags,
        n.folder_id,
        n.is_favorite,
        n.status,
        n.created_at,
        n.updated_at,
        1 - (n.embedding <=> query_embedding) AS similarity
    FROM public.notes n
    WHERE
        n.embedding IS NOT NULL
        AND n.status = 'active'
        AND 1 - (n.embedding <=> query_embedding) >= match_threshold
        AND (filter_user_id IS NULL OR n.user_id = filter_user_id)
        AND (filter_folder_id IS NULL OR n.folder_id = filter_folder_id)
    ORDER BY n.embedding <=> query_embedding  -- Ascending = most similar first
    LIMIT match_count;
END;
$$;


-- ── Step 6: Full-text Search RPC Function ────────────────────

CREATE OR REPLACE FUNCTION public.search_notes_fts(
    search_query    TEXT,
    filter_user_id  UUID,
    result_limit    INT DEFAULT 20
)
RETURNS TABLE (
    id          UUID,
    title       TEXT,
    content     TEXT,
    tags        TEXT[],
    folder_id   UUID,
    is_favorite BOOLEAN,
    created_at  TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ,
    rank        FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.id,
        n.title,
        n.content,
        n.tags,
        n.folder_id,
        n.is_favorite,
        n.created_at,
        n.updated_at,
        ts_rank(
            to_tsvector('english', coalesce(n.title, '') || ' ' || coalesce(n.content, '')),
            plainto_tsquery('english', search_query)
        ) AS rank
    FROM public.notes n
    WHERE
        n.user_id = filter_user_id
        AND n.status = 'active'
        AND to_tsvector('english', coalesce(n.title, '') || ' ' || coalesce(n.content, ''))
            @@ plainto_tsquery('english', search_query)
    ORDER BY rank DESC
    LIMIT result_limit;
END;
$$;


-- ── Step 7: Row Level Security (RLS) ─────────────────────────

-- Enable RLS on all tables
ALTER TABLE public.notes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whiteboards   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Notes policies
CREATE POLICY "Users can view own notes"
    ON public.notes FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notes"
    ON public.notes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notes"
    ON public.notes FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notes"
    ON public.notes FOR DELETE
    USING (auth.uid() = user_id);

-- Folders policies
CREATE POLICY "Users can view own folders"
    ON public.folders FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own folders"
    ON public.folders FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own folders"
    ON public.folders FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own folders"
    ON public.folders FOR DELETE
    USING (auth.uid() = user_id);

-- Whiteboards policies
CREATE POLICY "Users can view own whiteboards"
    ON public.whiteboards FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own whiteboards"
    ON public.whiteboards FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own whiteboards"
    ON public.whiteboards FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own whiteboards"
    ON public.whiteboards FOR DELETE
    USING (auth.uid() = user_id);

-- Chat messages policies
CREATE POLICY "Users can view own chat messages"
    ON public.chat_messages FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat messages"
    ON public.chat_messages FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own chat messages"
    ON public.chat_messages FOR DELETE
    USING (auth.uid() = user_id);


-- ── Step 8: Grant permissions for RPC functions ──────────────

-- Allow authenticated users to call the search functions
GRANT EXECUTE ON FUNCTION public.match_notes TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_notes_fts TO authenticated;

-- Allow anon users to read public data (none in this app, but good practice)
GRANT USAGE ON SCHEMA public TO anon, authenticated;


-- ── Done! ──────────────────────────────────────────────────────
-- Verify setup with:
-- SELECT * FROM pg_extension WHERE extname = 'vector';
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public';
-- SELECT polname, tablename FROM pg_policies WHERE schemaname = 'public';
