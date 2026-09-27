import os
import time
import requests

from .base import BaseLLMAdapter, LLMResponse

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiAdapter(BaseLLMAdapter):
    provider_name = "gemini"

    def call(self, prompt: str, model: str, prompt_type: str, **kwargs) -> LLMResponse:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return LLMResponse(
                model_name=model,
                provider=self.provider_name,
                prompt_type=prompt_type,
                output_text="",
                latency_ms=0,
                error="GEMINI_API_KEY not set in environment",
            )

        url = f"{GEMINI_API_BASE}/{model}:generateContent?key={api_key}"
        payload = {
            "contents": [
                {"parts": [{"text": prompt}]}
            ],
            "generationConfig": {
                "temperature": kwargs.get("temperature", 0.7),
                "maxOutputTokens": kwargs.get("max_tokens", 1024),
            },
        }

        start = time.time()
        try:
            response = requests.post(url, json=payload, timeout=30)
            latency_ms = (time.time() - start) * 1000

            if response.status_code != 200:
                return LLMResponse(
                    model_name=model,
                    provider=self.provider_name,
                    prompt_type=prompt_type,
                    output_text="",
                    latency_ms=latency_ms,
                    error=f"Gemini API error {response.status_code}: {response.text[:200]}",
                )

            data = response.json()

            # Gemini's response shape is different from Groq's — nested under candidates
            try:
                output_text = data["candidates"][0]["content"]["parts"][0]["text"]
            except (KeyError, IndexError):
                return LLMResponse(
                    model_name=model,
                    provider=self.provider_name,
                    prompt_type=prompt_type,
                    output_text="",
                    latency_ms=latency_ms,
                    error=f"Unexpected Gemini response shape: {str(data)[:200]}",
                )

            usage = data.get("usageMetadata", {})

            return LLMResponse(
                model_name=model,
                provider=self.provider_name,
                prompt_type=prompt_type,
                output_text=output_text,
                latency_ms=latency_ms,
                input_tokens=usage.get("promptTokenCount"),
                output_tokens=usage.get("candidatesTokenCount"),
            )

        except requests.exceptions.Timeout:
            return LLMResponse(
                model_name=model,
                provider=self.provider_name,
                prompt_type=prompt_type,
                output_text="",
                latency_ms=(time.time() - start) * 1000,
                error="Request to Gemini timed out",
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