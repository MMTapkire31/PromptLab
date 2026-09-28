from concurrent.futures import ThreadPoolExecutor, as_completed

from rest_framework.decorators import api_view
from rest_framework.response import Response

from llm_adapters.registry import ADAPTERS, public_models

from .prompt_builder import build_prompt


@api_view(['GET'])
def list_models(request):
    return Response({"models": public_models()})


@api_view(['POST'])
def compare_prompts(request):
    prompt = request.data.get('prompt')
    prompt_type = request.data.get('prompt_type', 'zero-shot')
    models = request.data.get('models', [])
    examples = request.data.get('examples', [])
    role = request.data.get('role')

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

    # Apply the chosen prompt engineering technique to the user's raw prompt
    try:
        final_prompt = build_prompt(prompt, prompt_type, examples=examples, role=role)
    except ValueError as e:
        return Response({"error": str(e)}, status=400)

    results = []

    with ThreadPoolExecutor(max_workers=len(models)) as executor:
        future_to_model = {
            executor.submit(ADAPTERS[model].call, final_prompt, model, prompt_type): model
            for model in models
        }

        for future in as_completed(future_to_model):
            result = future.result()
            results.append(result.__dict__)

    return Response({
        "prompt": prompt,
        "final_prompt": final_prompt,
        "prompt_type": prompt_type,
        "results": results,
    })