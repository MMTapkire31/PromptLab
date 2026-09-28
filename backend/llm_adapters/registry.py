from .groq_adapter import GroqAdapter
from .gemini_adapter import GeminiAdapter
from .mistral_adapter import MistralAdapter

_groq = GroqAdapter()
_gemini = GeminiAdapter()
_mistral = MistralAdapter()

# To add, remove or rename a model, edit this list and nothing else.
MODELS = [
    {"id": "openai/gpt-oss-20b", "provider": "Groq", "adapter": _groq},
    {"id": "openai/gpt-oss-120b", "provider": "Groq", "adapter": _groq},
    {"id": "qwen/qwen3.8-27b", "provider": "Groq", "adapter": _groq},
    {"id": "allam-2-7b", "provider": "Groq", "adapter": _groq},
    {"id": "gemini-3.8-flash", "provider": "Gemini", "adapter": _gemini},
    {"id": "gemini-3.1-flash-lite", "provider": "Gemini", "adapter": _gemini},
    {"id": "ministral-8b-latest", "provider": "Mistral", "adapter": _mistral},
    {"id": "ministral-14b-latest", "provider": "Mistral", "adapter": _mistral},
]

ADAPTERS = {m["id"]: m["adapter"] for m in MODELS}


def public_models():
    """What the frontend is allowed to see (no adapter objects)."""
    return [{"id": m["id"], "provider": m["provider"]} for m in MODELS]