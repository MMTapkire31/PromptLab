# PromptLab

A multi-LLM prompt evaluation and comparison platform — built for a Prompt Engineering course project.

Unlike typical "compare models side by side" tools, PromptLab's core focus is comparing how different **prompt engineering techniques** (zero-shot, one-shot, few-shot, chain-of-thought, role-based, structured) perform *across* models, scored on structured quality metrics rather than just showing raw output side by side.

## Features

### Working
- `/api/compare/` endpoint — submit a prompt + list of models, get back normalized responses (output text, latency, token counts, errors)
- Groq integration — 4 active models tested and working: `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, `allam-2-7b`
- Provider-agnostic adapter pattern (`BaseLLMAdapter` / `LLMResponse`) so new providers plug in without touching the orchestration logic

### Planned
- Google Gemini API integration (second free LLM provider)
- Concurrent model calls (currently sequential)
- Prompt type selector (zero-shot, one-shot, few-shot, CoT, role-based, structured)
- Structured scoring across metrics: accuracy, creativity, readability, completeness, reasoning
- Bar / radar charts visualizing metric scores per model
- AI-based prompt improvement suggestions
- Prompt history with export to PDF / CSV
- React frontend connected to the backend

## Tech Stack

- **Backend:** Django + Django REST Framework
- **Frontend:** React (Vite)
- **LLM Providers:** Groq (OpenAI GPT-OSS, Qwen, Allam models) — Gemini planned next

## Project Structure

```
promptlab/
├── backend/
│   ├── manage.py
│   ├── promptlab_project/      # Django settings, URL routing
│   ├── comparisons/             # /api/compare/ endpoint, models, views
│   └── llm_adapters/            # provider-agnostic adapter layer
│       ├── base.py               # BaseLLMAdapter, LLMResponse
│       └── groq_adapter.py       # Groq API integration
├── frontend/                    # React (Vite) app
├── .env.example                 # env var template (no real keys)
└── README.md
```


## Setup

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\Activate.ps1   # Windows PowerShell
# source venv/bin/activate  # Mac/Linux
pip install -r requirements.txt

# Copy env template and fill in your own API keys
cd ..
cp .env.example .env        # or manually create .env with the same structure

cd backend
python manage.py migrate
python manage.py runserver

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

## Status

🚧 Work in progress — built incrementally as a course project. Backend + Groq integration functional; Gemini integration, frontend, and scoring/metrics still to come.
