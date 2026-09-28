import os
import time
import requests

from .base import BaseLLMAdapter, LLMResponse

MISTRAL_API_BASE = "https://api.mistral.ai/v1/chat/completions"

class MistralAdapter(BaseLLMAdapter):
    provider_name = "mistral"

    def call(self, prompt: str, model: str, prompt_type: str, **kwargs) -> LLMResponse:
        api_key = os.environ.get("MISTRAL_API_KEY")
        if not api_key:
            return LLMResponse(
                model_name=model,
                provider=self.provider_name,
                prompt_type=prompt_type,
                output_text="",
                latency_ms=0,
                error="MISTRAL_API_KEY not set in environment",
            )

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        # Mistral uses the standard chat completions payload format
        payload = {
            "model": model,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": kwargs.get("temperature", 0.7),
            "max_tokens": kwargs.get("max_tokens", 1024),
        }

        start = time.time()
        try:
            response = requests.post(MISTRAL_API_BASE, json=payload, headers=headers, timeout=30)
            latency_ms = (time.time() - start) * 1000

            if response.status_code != 200:
                return LLMResponse(
                    model_name=model,
                    provider=self.provider_name,
                    prompt_type=prompt_type,
                    output_text="",
                    latency_ms=latency_ms,
                    error=f"Mistral API error {response.status_code}: {response.text[:200]}",
                )

            data = response.json()

            # Safely travel down Mistral's standard OpenAI-style schema array
            try:
                output_text = data["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError):
                return LLMResponse(
                    model_name=model,
                    provider=self.provider_name,
                    prompt_type=prompt_type,
                    output_text="",
                    latency_ms=latency_ms,
                    error=f"Unexpected Mistral response shape: {str(data)[:200]}",
                )

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
                error="Request to Mistral timed out",
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
