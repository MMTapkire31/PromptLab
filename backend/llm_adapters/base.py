from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class LLMResponse:
    model_name: str          # e.g. "llama-3.3-70b-versatile"
    provider: str            # e.g. "groq" or "gemini"
    prompt_type: str         # e.g. "zero-shot", "chain-of-thought"
    output_text: str
    latency_ms: float
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    error: Optional[str] = None   # set if the call failed; output_text will be empty


class BaseLLMAdapter(ABC):
    """
    Every provider adapter (Groq, Gemini, OpenRouter, ...) implements this
    interface. The orchestrator only ever talks to this, never to a
    provider's raw SDK/API directly.
    """

    provider_name: str  # override in subclass, e.g. "groq"

    @abstractmethod
    def call(self, prompt: str, model: str, prompt_type: str, **kwargs) -> LLMResponse:
        """
        Send `prompt` to `model` and return a normalized LLMResponse.
        Must NEVER raise — catch exceptions internally and return
        an LLMResponse with `error` set, so one failing model doesn't
        break the whole comparison batch.
        """
        raise NotImplementedError