# PromptLab

A multi-LLM prompt evaluation platform. It compares how different **prompt engineering techniques** (zero-shot, one-shot, few-shot, chain-of-thought, role-based, structured) perform across models from three providers, measuring correctness, token cost and latency.

Most comparison tools put one prompt through many models. PromptLab varies the **technique** too, so you can see how the same question behaves under each approach on each model.

## Evaluation results

12 reasoning problems with known numeric answers x 5 techniques x 4 models = **240 runs**, answers checked automatically (`evaluate.py`).

| Technique | Correct | Avg output tokens |
|---|---|---|
| zero-shot | 48/48 | 215 |
| one-shot | 48/48 | 158 |
| few-shot | 47/48 | 140 |
| chain-of-thought | 47/48 | 280 |
| role-based | 46/48 | 400 |

Models: `openai/gpt-oss-20b` (Groq), `gemini-3.1-flash-lite` (Google), `ministral-8b-latest`, `ministral-14b-latest` (Mistral).

**Findings**
- Accuracy was 96-100% for every technique. The differences (0-2 answers out of 48) are within noise, so no technique is shown to be more accurate on this set.
- Cost differed a lot: few-shot used about 35% fewer output tokens than zero-shot, and role-based about 1.9x more.
- Output length varied widely between models for the same correct answer, which accuracy alone hides.

Raw results are in `eval_results.csv` and `eval_results.json`.

## Features

- **Single mode**: one technique across several models, shown as side-by-side cards with latency and token counts
- **Matrix mode**: several techniques x several models in one run, shown as a grid
- **Six prompt techniques**, each wrapping the user's prompt differently. The UI shows the exact prompt sent
- **Three providers** behind one adapter interface (Groq, Google Gemini, Mistral). Providers run concurrently, and one failing model doesn't break the rest
- **Automatic retry** with backoff on 429/5xx, plus a per-card Retry button
- **LLM-as-judge scoring** (Gemini 3.8 Flash) on accuracy, creativity, readability, completeness and reasoning, shown as badges. It degrades to "scoring unavailable" when the judge is overloaded
- **Model list served by the backend** (`GET /api/models/`), so the UI follows the registry
- Dark chat-style UI, markdown rendering, and a history sidebar saved in the browser

## Architecture

```
React (Vite)  --->  Django REST API  --->  adapters  --->  Groq / Gemini / Mistral
                       |
                       +-- prompt_builder.py (technique -> final prompt)
                       +-- judge.py (LLM-as-judge)
```

Each provider implements `BaseLLMAdapter.call()` and returns a normalized `LLMResponse` (text, latency, tokens, error) without raising. Adding a provider means one adapter file plus one line in `llm_adapters/registry.py`.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/models/` | Available models and providers |
| `POST /api/compare/` | `prompt`, `prompt_type`, `models`, optional `examples`, `role` |
| `POST /api/compare-matrix/` | `prompt`, `prompt_types`, `models`, optional `examples`, `role`, `score` (false skips judging) |

## Project structure

```
promptlab/
├── backend/
│   ├── manage.py
│   ├── promptlab_project/        # settings, URL routing
│   ├── comparisons/              # views, prompt_builder.py, judge.py
│   └── llm_adapters/             # base.py, groq/gemini/mistral adapters, registry.py
├── frontend/src/                 # App.jsx, api.jsx, index.css
├── evaluate.py                   # reproducible evaluation script
├── eval_results.csv / .json
└── .env.example
```

## Setup

Requires Python 3.12+ and Node 18+. You need free API keys from Groq, Google AI Studio and Mistral.

```powershell
# 1. Keys: create .env in the repo root from the template
copy .env.example .env      # then fill in your keys

# 2. Backend
cd backend
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
py manage.py migrate
py manage.py runserver

# 3. Frontend (second terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

## Reproducing the evaluation

With the backend running:

```powershell
cd <repo root>
python evaluate.py
```

It takes about 10 minutes and prints accuracy and token tables by technique, by model, and by technique x model.

## Limitations

- The question set is small and easy for current models (a ceiling effect), so accuracy differences between techniques are not significant.
- Answers that were cut off before the final `ANSWER:` line count as wrong.
- Free-tier model IDs are deprecated often. Check each provider's models endpoint if a model returns 404.
- History is stored in the browser (`localStorage`), not a database.

## Roadmap

Bar and radar charts for judge scores, streaming responses, PDF/CSV export, database-backed history, a harder benchmark set, deployment.
