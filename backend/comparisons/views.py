from concurrent.futures import ThreadPoolExecutor, as_completed

from rest_framework.decorators import api_view
from rest_framework.response import Response

from llm_adapters.groq_adapter import GroqAdapter


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

    groq_adapter = GroqAdapter()
    results = []

    # Fire all model calls at once instead of one-by-one.
    with ThreadPoolExecutor(max_workers=len(models)) as executor:
        # Kick off every call and remember which future belongs to which model
        future_to_model = {
            executor.submit(groq_adapter.call, prompt, model, prompt_type): model
            for model in models
        }

        # Collect results as each one finishes (not necessarily in the order submitted)
        for future in as_completed(future_to_model):
            result = future.result()
            results.append(result.__dict__)

    return Response({
        "prompt": prompt,
        "prompt_type": prompt_type,
        "results": results,
    })