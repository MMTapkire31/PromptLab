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

    for model in models:
        result = groq_adapter.call(prompt=prompt, model=model, prompt_type=prompt_type)
        results.append(result.__dict__)  # convert the LLMResponse dataclass to a dict for JSON

    return Response({
        "prompt": prompt,
        "prompt_type": prompt_type,
        "results": results,
    })