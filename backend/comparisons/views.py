from concurrent.futures import ThreadPoolExecutor, as_completed

from rest_framework.decorators import api_view
from rest_framework.response import Response

from llm_adapters.groq_adapter import GroqAdapter
from llm_adapters.gemini_adapter import GeminiAdapter
from llm_adapters.mistral_adapter import MistralAdapter


# Maps each model name to which adapter should handle it
ADAPTERS = {
    "openai/gpt-oss-20b": GroqAdapter(),
    "openai/gpt-oss-120b": GroqAdapter(),
    "qwen/qwen3.8-27b": GroqAdapter(),
    "allam-2-7b": GroqAdapter(),
    "gemini-3.8-flash": GeminiAdapter(),
    "gemini-3.1-flash-lite": GeminiAdapter(),
    "ministral-8b-latest": MistralAdapter(),
    "ministral-14b-latest": MistralAdapter(),
}


@api_view(['POST'])
def compare_prompts(request):
    prompt = request.data.get('prompt')
    prompt_type = request.data.get('prompt_type', 'zero-shot')
    models = request.data.get('models', [])

    if not prompt or not models:
        return Response(
            {"error": "Both 'prompt' and 'models' (non-empty list) are required."},
            status=400
        )

    unknown_models = [m for m in models if m not in ADAPTERS]
    if unknown_models:
        return Response(
            {"error": f"Unknown model(s): {unknown_models}. Available: {list(ADAPTERS.keys())}"},
            status=400
        )

    results = []

    with ThreadPoolExecutor(max_workers=len(models)) as executor:
        future_to_model = {
            executor.submit(ADAPTERS[model].call, prompt, model, prompt_type): model
            for model in models
        }

        for future in as_completed(future_to_model):
            result = future.result()
            results.append(result.__dict__)

    return Response({
        "prompt": prompt,
        "prompt_type": prompt_type,
        "results": results,
    })