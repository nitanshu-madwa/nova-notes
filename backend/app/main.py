"""
AetherNotes - AI-Powered Note Taking Application
FastAPI Backend
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
import time
import logging

from app.core.config import settings
from app.routers import auth, notes, folders, ai, search, whiteboards, chat

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Nova Notes API",
    description="AI-Powered Note Taking Application Backend",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)


from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://nova-notes-omega.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Middleware ──────────────────────────────────────────────────────────────

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response


@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"{request.method} {request.url.path}")
    try:
        response = await call_next(request)
        logger.info(f"{request.method} {request.url.path} → {response.status_code}")
        return response
    except Exception as e:
        logger.error(f"{request.method} {request.url.path} → ERROR: {e}")
        raise


# ── Exception Handlers ──────────────────────────────────────────────────────

@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(status_code=404, content={"detail": "Resource not found"})


@app.exception_handler(500)
async def server_error_handler(request: Request, exc):
    logger.error(f"Internal server error: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ── Routers ─────────────────────────────────────────────────────────────────

app.include_router(auth.router,        prefix="/api/auth",       tags=["Authentication"])
app.include_router(notes.router,       prefix="/api/notes",      tags=["Notes"])
app.include_router(folders.router,     prefix="/api/folders",    tags=["Folders"])
app.include_router(whiteboards.router, prefix="/api/whiteboards",tags=["Whiteboards"])
app.include_router(ai.router,          prefix="/api/ai",         tags=["AI Features"])
app.include_router(search.router,      prefix="/api/search",     tags=["Search"])
app.include_router(chat.router,        prefix="/api/chat",       tags=["AI Chat"])


# ── Health & Root ────────────────────────────────────────────────────────────

@app.get("/", tags=["Root"])
async def root():
    return {
        "app": "Nova Notes API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/api/docs"
    }


@app.get("/api/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "version": "1.0.0"
    }
