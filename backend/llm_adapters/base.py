import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

import requests

RETRY_STATUSES = {429, 500, 502, 503, 504}


def post_with_retry(url, retries=2, base_delay=1.0, **kwargs):
    """requests.post that retries on temporary errors (rate limit / overload)
    with a short growing delay. Returns the last response either way."""
    response = None
    for attempt in range(retries + 1):
        response = requests.post(url, **kwargs)
        if response.status_code not in RETRY_STATUSES or attempt == retries:
            return response
        delay = base_delay * (2 ** attempt)  # 1s, then 2s
        retry_after = response.headers.get("Retry-After")
        if retry_after and retry_after.isdigit():
            delay = min(max(delay, int(retry_after)), 5)
        time.sleep(delay)
    return response


@dataclass
class LLMResponse:
    model_name: str          # e.g. "openai/gpt-oss-20b"
    provider: str            # e.g. "groq" or "gemini"
    prompt_type: str         # e.g. "zero-shot", "chain-of-thought"
    output_text: str
    latency_ms: float
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    error: Optional[str] = None   # set if the call failed; output_text will be empty


class BaseLLMAdapter(ABC):
    """
    Every provider adapter (Groq, Gemini, Mistral, ...) implements this
    interface. The orchestrator only ever talks to this, never to a
    provider's raw API directly.
    """

    provider_name: str  # override in subclass, e.g. "groq"

    @abstractmethod
    def call(self, prompt: str, model: str, prompt_type: str, **kwargs) -> LLMResponse:
        """
        Send `prompt` to `model` and return a normalized LLMResponse.
        Must NEVER raise: catch exceptions internally and return
        an LLMResponse with `error` set, so one failing model doesn't
        break the whole comparison batch.
        """
        raise NotImplementedError