"""
Nova Notes - Embedding Service
Generates embeddings via Groq API (nomic-embed-text).
No local model, no torch, no onnxruntime required.
"""

import logging
import re
import httpx
from typing import List, Optional
from app.core.config import settings

logger = logging.getLogger(__name__)

GROQ_EMBED_URL = "https://api.groq.com/openai/v1/embeddings"


def generate_embedding(text: str) -> Optional[List[float]]:
    """Generate a single embedding according to configured provider.

    - If `EMBEDDING_PROVIDER` is `sentence_transformers`, attempt local embedding.
    - Otherwise fall back to the Groq HTTP API.
    """
    if not text or not text.strip():
        return None

    provider = (settings.EMBEDDING_PROVIDER or "").lower()

    # Local sentence-transformers provider (optional dependency)
    if provider == "sentence_transformers":
        try:
            from sentence_transformers import SentenceTransformer

            model_name = settings.EMBEDDING_MODEL or "all-MiniLM-L6-v2"
            st_model = globals().get("_st_model")
            st_model_name = globals().get("_st_model_name")
            if st_model is None or st_model_name != model_name:
                st_model = SentenceTransformer(model_name)
                globals()["_st_model"] = st_model
                globals()["_st_model_name"] = model_name

            emb = st_model.encode(text[:8000])
            # Convert to Python list if numpy array
            try:
                embedding = emb.tolist()
            except Exception:
                embedding = list(emb)

            if len(embedding) != settings.EMBEDDING_DIMENSION:
                logger.warning(
                    f"Local embedding dimension mismatch: received {len(embedding)} values but expected {settings.EMBEDDING_DIMENSION}."
                )
                return None
            return embedding
        except Exception as e:
            logger.error(f"Local embedding generation failed: {e}")
            # Fall through to remote provider

    # Remote Groq API provider (default)
    model = settings.GROQ_EMBED_MODEL or "nomic-embed-text"
    try:
        resp = httpx.post(
            GROQ_EMBED_URL,
            headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
            json={"model": model, "input": text[:8000]},
            timeout=15,
        )
        resp.raise_for_status()
        embedding = resp.json().get("data", [])[0].get("embedding")
        if not isinstance(embedding, list):
            logger.warning("Embedding response did not return a list; skipping semantic search.")
            return None
        if len(embedding) != settings.EMBEDDING_DIMENSION:
            logger.warning(
                f"Embedding dimension mismatch: received {len(embedding)} values but expected {settings.EMBEDDING_DIMENSION}. "
                "Skipping semantic search and note embedding storage until the model/schema align."
            )
            return None
        return embedding
    except Exception as e:
        logger.error(f"Embedding error: {e}")
        return None


def generate_embeddings_batch(texts: List[str]) -> List[Optional[List[float]]]:
    return [generate_embedding(t) for t in texts]


def prepare_note_text_for_embedding(title: str, content: str, tags: List[str] = None) -> str:
    parts = []
    if title:
        parts.append(f"Title: {title}")
        parts.append(f"Title: {title}")
    if tags:
        parts.append(f"Tags: {', '.join(tags)}")
    if content:
        clean = re.sub(r'#{1,6}\s', '', content)
        clean = re.sub(r'\*{1,2}([^*]+)\*{1,2}', r'\1', clean)
        clean = re.sub(r'`[^`]+`', '', clean)
        clean = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', clean)
        parts.append(clean[:4000])
    return "\n".join(parts)
