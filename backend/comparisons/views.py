from concurrent.futures import ThreadPoolExecutor, as_completed

from rest_framework.decorators import api_view
from rest_framework.response import Response

from llm_adapters.registry import ADAPTERS, public_models

from .prompt_builder import build_prompt

from .prompt_builder import build_prompt, build_matrix_prompts


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


@api_view(['POST'])
def compare_matrix(request):
    prompt = request.data.get('prompt')
    prompt_types = request.data.get('prompt_types', [])
    models = request.data.get('models', [])
    examples = request.data.get('examples', [])
    role = request.data.get('role')

    if not prompt or not models or not prompt_types:
        return Response(
            {"error": "'prompt', 'prompt_types' and 'models' (all non-empty) are required."},
            status=400
        )

    unknown_models = [m for m in models if m not in ADAPTERS]
    if unknown_models:
        return Response(
            {"error": f"Unknown model(s): {unknown_models}. Available: {list(ADAPTERS.keys())}"},
            status=400
        )

    built = build_matrix_prompts(prompt, prompt_types, examples=examples, role=role)
    runnable = [b for b in built if "final_prompt" in b]

    # (prompt_type, model) pairs we actually need to call
    jobs = [
        (b["prompt_type"], b["final_prompt"], model)
        for b in runnable
        for model in models
    ]

    results_by_type = {b["prompt_type"]: [] for b in built}

    if jobs:
        with ThreadPoolExecutor(max_workers=min(len(jobs), 16)) as executor:
            future_to_job = {
                executor.submit(ADAPTERS[model].call, final_prompt, model, pt): (pt, model)
                for pt, final_prompt, model in jobs
            }
            for future in as_completed(future_to_job):
                pt, _model = future_to_job[future]
                result = future.result()
                results_by_type[pt].append(result.__dict__)

    matrix = []
    for b in built:
        entry = {"prompt_type": b["prompt_type"]}
        if "error" in b:
            entry["error"] = b["error"]
            entry["results"] = []
        else:
            entry["final_prompt"] = b["final_prompt"]
            entry["results"] = results_by_type[b["prompt_type"]]
        matrix.append(entry)

    return Response({"prompt": prompt, "models": models, "matrix": matrix})