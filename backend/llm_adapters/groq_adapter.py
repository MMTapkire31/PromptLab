import os
import time
import requests

from .base import BaseLLMAdapter, LLMResponse, post_with_retry

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"


class GroqAdapter(BaseLLMAdapter):
    provider_name = "groq"

    def call(self, prompt: str, model: str, prompt_type: str, **kwargs) -> LLMResponse:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            return LLMResponse(
                model_name=model,
                provider=self.provider_name,
                prompt_type=prompt_type,
                output_text="",
                latency_ms=0,
                error="GROQ_API_KEY not set in environment",
            )

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": kwargs.get("temperature", 0.7),
            "max_tokens": kwargs.get("max_tokens", 900),        }

        start = time.time()
        try:
            response = post_with_retry(GROQ_API_URL, headers=headers, json=payload, timeout=30)
            latency_ms = (time.time() - start) * 1000

            if response.status_code != 200:
                return LLMResponse(
                    model_name=model,
                    provider=self.provider_name,
                    prompt_type=prompt_type,
                    output_text="",
                    latency_ms=latency_ms,
                    error=f"Groq API error {response.status_code}: {response.text[:200]}",
                )

            data = response.json()
            output_text = data["choices"][0]["message"]["content"]
            usage = data.get("usage", {})

            return LLMResponse(
                model_name=model,
                provider=self.provider_name,
                prompt_type=prompt_type,
                output_text=output_text,
                latency_ms=latency_ms,
                input_tokens=usage.get("prompt_tokens"),
                output_tokens=usage.get("completion_tokens"),
            )

        except requests.exceptions.Timeout:
            return LLMResponse(
                model_name=model,
                provider=self.provider_name,
                prompt_type=prompt_type,
                output_text="",
                latency_ms=(time.time() - start) * 1000,
                error="Request to Groq timed out",
            )
        except Exception as e:
            return LLMResponse(
                model_name=model,
                provider=self.provider_name,
                prompt_type=prompt_type,
                output_text="",
                latency_ms=(time.time() - start) * 1000,
                error=str(e),
            )