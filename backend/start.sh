#!/usr/bin/env bash
# Nova Notes Backend - Development Startup Script
set -e

echo "🌟 Nova Notes Backend"
echo "======================"

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1 | cut -d' ' -f2 | cut -d'.' -f1-2)
REQUIRED="3.11"
if [ "$(printf '%s\n' "$REQUIRED" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED" ]; then
    echo "❌ Python $REQUIRED+ required, found $PYTHON_VERSION"
    exit 1
fi
echo "✅ Python $PYTHON_VERSION"

# Check virtual environment
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

# Install/update dependencies
echo "📦 Installing dependencies..."
pip install -q -r requirements.txt

# Check .env file
if [ ! -f ".env" ]; then
    echo ""
    echo "⚠️  No .env file found!"
    echo "   Copy .env.example to .env and fill in your API keys:"
    echo "   cp .env.example .env"
    echo ""
    exit 1
fi
echo "✅ .env file found"

# Check required env vars
source .env 2>/dev/null || true

if [ -z "$SUPABASE_URL" ] || [ "$SUPABASE_URL" = "https://your-project-id.supabase.co" ]; then
    echo "⚠️  Warning: SUPABASE_URL not configured in .env"
fi

if [ -z "$GROQ_API_KEY" ] || [ "$GROQ_API_KEY" = "gsk_your-groq-api-key-here" ]; then
    echo "⚠️  Warning: GROQ_API_KEY not configured in .env"
fi

echo ""
echo "🚀 Starting Nova Notes API..."
echo "   URL: http://localhost:8000"
echo "   Docs: http://localhost:8000/api/docs"
echo "   Press Ctrl+C to stop"
echo ""

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --log-level info
