# Nova Notes Backend

AI-powered note-taking application backend built with **FastAPI** (Python).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | FastAPI 0.115 |
| Database | Supabase (PostgreSQL) |
| Vector Search | pgvector (via Supabase) |
| AI | Groq API (llama-3.3-70b-versatile) |
| Embeddings | sentence-transformers (all-MiniLM-L6-v2) |
| Auth | Supabase Auth (JWT) |

---

## Project Structure

```
aethernotes-backend/
├── app/
│   ├── main.py                  # FastAPI app, middleware, router registration
│   ├── core/
│   │   ├── config.py            # Pydantic settings (reads from .env)
│   │   ├── supabase.py          # Supabase client factory
│   │   └── dependencies.py      # Auth dependencies (JWT verification)
│   ├── routers/
│   │   ├── auth.py              # /api/auth — sign up, sign in, refresh
│   │   ├── notes.py             # /api/notes — full CRUD + AI tags on save
│   │   ├── folders.py           # /api/folders — folder management
│   │   ├── whiteboards.py       # /api/whiteboards — canvas board CRUD
│   │   ├── ai.py                # /api/ai — tags, title, summary, actions
│   │   ├── search.py            # /api/search — hybrid keyword + semantic
│   │   └── chat.py              # /api/chat — AI chatbot with RAG + history
│   ├── services/
│   │   ├── ai_service.py        # All Groq AI calls
│   │   └── embedding_service.py # Vector embedding generation
│   └── schemas/
│       └── schemas.py           # All Pydantic request/response models
├── scripts/
│   └── supabase_setup.sql       # Complete DB schema + RLS + vector search
├── .env.example                 # Environment variable template
├── requirements.txt
├── Dockerfile
└── README.md
```

---

## Quick Setup

### 1. Clone and Install

```bash
cd aethernotes-backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your actual API keys (see below)
```

Required values in `.env`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret
GROQ_API_KEY=gsk_your-groq-key
```

### 3. Set Up Supabase Database

1. Go to [supabase.com](https://supabase.com) and create a project
2. Open **SQL Editor** in the dashboard
3. Create a **New Query**, paste the full contents of `scripts/supabase_setup.sql`
4. Click **Run** — this creates all tables, indexes, RLS policies, and RPC functions

### 4. Run the Server

```bash
# Development (with auto-reload)
uvicorn app.main:app --reload --port 8000

# Production
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

API docs available at: http://localhost:8000/api/docs

---

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/signup | Register new user |
| POST | /api/auth/signin | Sign in with email/password |
| POST | /api/auth/signout | Sign out |
| POST | /api/auth/refresh | Refresh access token |
| GET | /api/auth/me | Get current user profile |
| PUT | /api/auth/me | Update user profile |

### Notes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/notes | List notes (with filters & pagination) |
| POST | /api/notes | Create note (with optional AI tags) |
| GET | /api/notes/{id} | Get single note |
| PATCH | /api/notes/{id} | Update note |
| DELETE | /api/notes/{id} | Delete note |
| POST | /api/notes/{id}/archive | Archive note |
| POST | /api/notes/{id}/unarchive | Restore note |
| POST | /api/notes/{id}/favorite | Toggle favorite |
| POST | /api/notes/bulk/delete | Delete multiple notes |
| POST | /api/notes/bulk/move | Move notes to folder |

### Folders

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/folders | List all folders |
| POST | /api/folders | Create folder |
| GET | /api/folders/{id} | Get folder |
| PATCH | /api/folders/{id} | Update folder |
| DELETE | /api/folders/{id} | Delete folder (moves notes to root) |

### Whiteboards

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/whiteboards | List whiteboards |
| POST | /api/whiteboards | Create whiteboard |
| GET | /api/whiteboards/{id} | Get whiteboard |
| PATCH | /api/whiteboards/{id} | Save canvas data |
| DELETE | /api/whiteboards/{id} | Delete whiteboard |

### AI Features

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/ai/tags | Auto-generate tags |
| POST | /api/ai/title | Suggest note title |
| POST | /api/ai/summarize | Summarize note |
| POST | /api/ai/action-items | Extract action items |
| POST | /api/ai/improve | Improve/rewrite note content |
| POST | /api/ai/analyze | Run all analyses in one call |

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/search | Hybrid search (keyword + semantic) |
| GET | /api/search/suggest | Autocomplete suggestions |

### AI Chat (RAG)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/chat/message | Send message (general or notes mode) |
| GET | /api/chat/sessions | List chat sessions |
| GET | /api/chat/session/{id} | Get session messages |
| DELETE | /api/chat/session/{id} | Delete session |
| DELETE | /api/chat/history | Clear all history |

---

## Key Design Decisions

### Authentication
- All protected routes use `Depends(get_current_user)` which validates the Supabase JWT
- The user's token is passed to all Supabase queries so RLS is enforced automatically
- Service role key is available for admin operations but not used in normal flow

### Vector Search
- Uses `sentence-transformers/all-MiniLM-L6-v2` (384-dim, ~80MB, runs on CPU)
- Embeddings are generated on note create/update in the background
- Semantic search calls the `match_notes` PostgreSQL RPC function via Supabase
- Hybrid search combines semantic + keyword results, deduplicating by ID

### RAG Chatbot
- "notes" mode: embeds the user's query → finds top-5 similar notes → passes as context
- Falls back to keyword search if embedding generation fails
- Full conversation history stored in `chat_messages` table per session
- Last N messages passed as history to LLM (configurable via `MAX_CHAT_HISTORY_MESSAGES`)

### Embedding Model
- First request downloads the model (~80MB) — subsequent requests use cached version
- Model is cached at `~/.cache/huggingface/hub/` by default
- For production Docker, model is pre-downloaded during image build

---

## Docker Deployment

```bash
# Build image
docker build -t aethernotes-backend .

# Run container
docker run -p 8000:8000 --env-file .env aethernotes-backend
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| SUPABASE_URL | ✅ | — | Your Supabase project URL |
| SUPABASE_ANON_KEY | ✅ | — | Supabase anon/public key |
| SUPABASE_SERVICE_ROLE_KEY | ✅ | — | Supabase service role key |
| SUPABASE_JWT_SECRET | ✅ | — | JWT secret from Supabase settings |
| GROQ_API_KEY | ✅ | — | Groq API key |
| GROQ_CHAT_MODEL | ❌ | llama-3.3-70b-versatile | Primary AI model |
| GROQ_FAST_MODEL | ❌ | llama-3.1-8b-instant | Fast model for quick tasks |
| EMBEDDING_MODEL | ❌ | all-MiniLM-L6-v2 | Sentence transformer model |
| CORS_ORIGINS | ❌ | localhost:5173 | Allowed frontend origins |
| DEBUG | ❌ | false | Enable debug logging |
