"""
AetherNotes - Groq AI Service
Handles all AI features: tagging, summarization, action items,
title suggestion, and RAG chatbot.
"""

import logging
import json
import re
from typing import List, Optional, Dict, Any
from groq import Groq, AsyncGroq

from app.core.config import settings

logger = logging.getLogger(__name__)

# Lazy-loaded Groq client
_groq_client: Optional[AsyncGroq] = None


def get_groq_client() -> AsyncGroq:
    global _groq_client
    if _groq_client is None:
        if not settings.GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY must be set in .env")
        _groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        logger.info("Groq async client initialized")
    return _groq_client


def _truncate(text: str, max_chars: int = None) -> str:
    limit = max_chars or settings.MAX_NOTE_LENGTH_FOR_AI
    return text[:limit] + ("..." if len(text) > limit else "")


def _extract_json(text: str) -> Any:
    """Extract JSON from model response, stripping markdown fences."""
    text = text.strip()
    # Remove ```json ... ``` fences
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    return json.loads(text)


# ── Auto-Tagging ─────────────────────────────────────────────────────────────

async def generate_tags(title: str, content: str) -> List[str]:
    """Auto-generate relevant tags for a note."""
    client = get_groq_client()
    text = _truncate(f"Title: {title}\n\nContent:\n{content}", 3000)

    prompt = f"""Analyze this note and generate 3-7 relevant, concise tags.

{text}

Respond ONLY with a JSON array of lowercase tags. Example: ["productivity", "meeting", "q4-planning"]
Tags should be: short (1-3 words), relevant, reusable across notes. No punctuation in tags."""

    try:
        response = await client.chat.completions.create(
            model=settings.GROQ_FAST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.3,
        )
        raw = response.choices[0].message.content or "[]"
        tags = _extract_json(raw)
        if isinstance(tags, list):
            # Clean and validate tags
            cleaned = [str(t).lower().strip().replace(" ", "-") for t in tags if t]
            return cleaned[:7]
        return []
    except Exception as e:
        logger.error(f"Tag generation failed: {e}")
        return []


# ── Title Suggestion ──────────────────────────────────────────────────────────

async def suggest_title(content: str, existing_title: str = "") -> str:
    """Suggest a better title for a note based on its content."""
    client = get_groq_client()
    text = _truncate(content, 2000)

    context = f'Current title: "{existing_title}"\n\n' if existing_title else ""
    prompt = f"""{context}Based on this note content, suggest a clear, concise, descriptive title.

Content:
{text}

Respond ONLY with the title text (no quotes, no explanation). Max 10 words."""

    try:
        response = await client.chat.completions.create(
            model=settings.GROQ_FAST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=50,
            temperature=0.4,
        )
        title = response.choices[0].message.content or ""
        return title.strip().strip('"').strip("'")
    except Exception as e:
        logger.error(f"Title suggestion failed: {e}")
        return existing_title


# ── Summarization ─────────────────────────────────────────────────────────────

async def summarize_note(title: str, content: str) -> str:
    """Generate a concise summary of a note."""
    client = get_groq_client()
    text = _truncate(content, 6000)

    prompt = f"""Summarize this note in 2-4 clear, informative sentences.

Title: {title}
Content:
{text}

Write a helpful summary that captures the key points. Be direct and informative."""

    try:
        response = await client.chat.completions.create(
            model=settings.GROQ_CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            temperature=0.3,
        )
        return response.choices[0].message.content or "Could not generate summary."
    except Exception as e:
        logger.error(f"Summarization failed: {e}")
        return "Summary generation failed. Please try again."


# ── Action Items Extraction ───────────────────────────────────────────────────

async def extract_action_items(title: str, content: str) -> List[str]:
    """Extract action items / tasks from a note."""
    client = get_groq_client()
    text = _truncate(content, 4000)

    prompt = f"""Extract all action items, tasks, or to-dos from this note.

Title: {title}
Content:
{text}

Respond ONLY with a JSON array of action item strings.
Example: ["Review Q4 report", "Schedule meeting with team", "Update documentation"]
If no action items found, return an empty array: []
Each item should be a clear, actionable task starting with a verb."""

    try:
        response = await client.chat.completions.create(
            model=settings.GROQ_FAST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=400,
            temperature=0.2,
        )
        raw = response.choices[0].message.content or "[]"
        items = _extract_json(raw)
        if isinstance(items, list):
            return [str(item).strip() for item in items if item][:15]
        return []
    except Exception as e:
        logger.error(f"Action items extraction failed: {e}")
        return []


# ── AI Chatbot (RAG) ──────────────────────────────────────────────────────────

async def chat_with_ai(
    user_message: str,
    conversation_history: List[Dict[str, str]],
    relevant_notes: List[Dict[str, Any]] = None,
    mode: str = "general",  # "general" | "notes"
) -> str:
    """
    AI Chatbot with optional RAG context from user's notes.
    
    Args:
        user_message: The user's latest message
        conversation_history: List of {"role": "user"|"assistant", "content": "..."} dicts
        relevant_notes: List of notes retrieved via semantic search (for RAG)
        mode: "general" for general chat, "notes" for notes-specific chat
    """
    client = get_groq_client()

    # Build system prompt
    if mode == "notes" and relevant_notes:
        notes_context = _build_notes_context(relevant_notes)
        system_prompt = f"""You are AetherNotes AI, an intelligent assistant with access to the user's personal notes.

Your role is to help the user understand, analyze, and work with their notes.

RELEVANT NOTES FROM USER'S KNOWLEDGE BASE:
{notes_context}

Guidelines:
- Answer based primarily on the notes provided above
- Be conversational and helpful
- If the notes don't fully answer the question, say so and offer what you can
- Reference specific notes by title when relevant (e.g., "According to your note 'Meeting Notes'...")
- If asked to do something with notes (summarize, compare, extract info), do it based on the context above
- Today's context: You are helping the user explore and understand their personal notes"""

    elif mode == "notes" and not relevant_notes:
        system_prompt = """You are AetherNotes AI, an intelligent assistant for the user's note-taking app.

I searched your notes but couldn't find anything closely related to your question.
Help the user understand this and suggest they:
1. Try different search terms
2. Create a new note on this topic
3. Or ask you a more general question

Be friendly and helpful."""

    else:
        system_prompt = """You are AetherNotes AI, a helpful and intelligent assistant built into AetherNotes, a beautiful note-taking application.

You can help with:
- General questions and conversations
- Writing assistance (drafting, editing, improving text)
- Research and explanations  
- Note organization strategies
- Productivity and knowledge management tips
- Answering questions about the user's notes (they can switch to 'Chat with Notes' mode)

Be conversational, helpful, concise, and friendly. Use markdown formatting when it helps clarity."""

    # Build messages array (limit history for context window)
    recent_history = conversation_history[-(settings.MAX_CHAT_HISTORY_MESSAGES):]
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(recent_history)
    messages.append({"role": "user", "content": user_message})

    try:
        response = await client.chat.completions.create(
            model=settings.GROQ_CHAT_MODEL,
            messages=messages,
            max_tokens=1500,
            temperature=0.7,
        )
        return response.choices[0].message.content or "I couldn't generate a response. Please try again."
    except Exception as e:
        logger.error(f"Chat completion failed: {e}")
        return "I encountered an error. Please check your connection and try again."


async def chat_with_ai_stream(
    user_message: str,
    conversation_history: List[Dict[str, str]],
    relevant_notes: List[Dict[str, Any]] = None,
    mode: str = "general",  # "general" | "notes"
):
    """
    AI Chatbot with optional RAG context yielding token chunks from Groq's streaming API.
    """
    client = get_groq_client()

    # Build system prompt
    if mode == "notes" and relevant_notes:
        notes_context = _build_notes_context(relevant_notes)
        system_prompt = f"""You are AetherNotes AI, an intelligent assistant with access to the user's personal notes.

Your role is to help the user understand, analyze, and work with their notes.

RELEVANT NOTES FROM USER'S KNOWLEDGE BASE:
{notes_context}

Guidelines:
- Answer based primarily on the notes provided above
- Be conversational and helpful
- If the notes don't fully answer the question, say so and offer what you can
- Reference specific notes by title when relevant (e.g., "According to your note 'Meeting Notes'...")
- If asked to do something with notes (summarize, compare, extract info), do it based on the context above
- Today's context: You are helping the user explore and understand their personal notes"""

    elif mode == "notes" and not relevant_notes:
        system_prompt = """You are AetherNotes AI, an intelligent assistant for the user's note-taking app.

I searched your notes but couldn't find anything closely related to your question.
Help the user understand this and suggest they:
1. Try different search terms
2. Create a new note on this topic
3. Or ask you a more general question

Be friendly and helpful."""

    else:
        system_prompt = """You are AetherNotes AI, a helpful and intelligent assistant built into AetherNotes, a beautiful note-taking application.

You can help with:
- General questions and conversations
- Writing assistance (drafting, editing, improving text)
- Research and explanations  
- Note organization strategies
- Productivity and knowledge management tips
- Answering questions about the user's notes (they can switch to 'Chat with Notes' mode)

Be conversational, helpful, concise, and friendly. Use markdown formatting when it helps clarity."""

    recent_history = conversation_history[-(settings.MAX_CHAT_HISTORY_MESSAGES):]
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(recent_history)
    messages.append({"role": "user", "content": user_message})

    try:
        response_stream = await client.chat.completions.create(
            model=settings.GROQ_CHAT_MODEL,
            messages=messages,
            max_tokens=1500,
            temperature=0.7,
            stream=True,
        )
        async for chunk in response_stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    except Exception as e:
        logger.error(f"Chat streaming failed: {e}")
        yield "I encountered an error while streaming the response. Please try again."


def _build_notes_context(notes: List[Dict[str, Any]]) -> str:
    """Format retrieved notes into a readable context string for the AI."""
    if not notes:
        return "No relevant notes found."

    parts = []
    for i, note in enumerate(notes[:settings.MAX_RAG_CONTEXT_NOTES], 1):
        title = note.get("title", "Untitled")
        content = note.get("content", "")
        tags = note.get("tags", [])
        created_at = note.get("created_at", "")

        # Truncate content per note
        truncated_content = _truncate(content, 1500)
        tags_str = f"Tags: {', '.join(tags)}" if tags else ""
        date_str = f"Created: {created_at[:10]}" if created_at else ""

        meta = " | ".join(filter(None, [tags_str, date_str]))
        parts.append(
            f"--- NOTE {i}: {title} ---\n"
            + (f"[{meta}]\n" if meta else "")
            + f"{truncated_content}\n"
        )

    return "\n".join(parts)


# ── Note Improvement ─────────────────────────────────────────────────────────

async def improve_note(title: str, content: str, instruction: str) -> str:
    """
    Improve/rewrite note content based on a user instruction.
    e.g., "Make it more formal", "Fix grammar", "Expand on the key points"
    """
    client = get_groq_client()
    text = _truncate(content, 5000)

    prompt = f"""Here is a note titled "{title}":

{text}

User's instruction: {instruction}

Please apply the instruction and return the improved note content.
Return ONLY the improved content, no explanation."""

    try:
        response = await client.chat.completions.create(
            model=settings.GROQ_CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,
            temperature=0.5,
        )
        return response.choices[0].message.content or content
    except Exception as e:
        logger.error(f"Note improvement failed: {e}")
        return content
