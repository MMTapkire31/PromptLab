import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

from llm_adapters.gemini_adapter import GeminiAdapter

JUDGE_MODEL = "gemini-3.8-flash"
METRICS = ["accuracy", "creativity", "readability", "completeness", "reasoning"]

_judge_adapter = GeminiAdapter()


def _build_judge_prompt(user_prompt, answer):
    return (
        "You are an impartial evaluator of AI assistant answers. "
        "Score the ANSWER below for the given QUESTION on these five metrics, "
        f"each from 1 (poor) to 10 (excellent): {', '.join(METRICS)}.\n\n"
        f"QUESTION:\n{user_prompt}\n\nANSWER:\n{answer}\n\n"
        "Respond with ONLY a JSON object, no other text and no markdown fences, "
        "in exactly this shape:\n"
        '{"accuracy": <1-10>, "creativity": <1-10>, "readability": <1-10>, '
        '"completeness": <1-10>, "reasoning": <1-10>, "notes": "<one short sentence>"}'
    )


def _extract_json(text):
    text = text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    return json.loads(text)


def score_answer(user_prompt, answer):
    """Returns a dict of 1-10 scores plus 'notes', or {'error': ...}."""
    if not answer or not answer.strip():
        return {"error": "Nothing to score (empty answer)."}

    result = _judge_adapter.call(
        prompt=_build_judge_prompt(user_prompt, answer),
        model=JUDGE_MODEL,
        prompt_type="judge",
    )
    if result.error:
        return {"error": f"Judge call failed: {result.error}"}

    try:
        parsed = _extract_json(result.output_text)
        scores = {m: parsed.get(m) for m in METRICS}
        for m in METRICS:
            v = scores[m]
            if not isinstance(v, (int, float)) or not (1 <= v <= 10):
                return {"error": f"Judge returned an invalid score for {m}: {v!r}"}
        scores["notes"] = parsed.get("notes", "")
        return scores
    except (json.JSONDecodeError, AttributeError, TypeError):
        return {"error": "Could not parse the judge's response."}


def score_many(user_prompt, items):
    """items: list of (key, answer_text). Returns {key: scores_dict}."""
    scores = {}
    if not items:
        return scores
    with ThreadPoolExecutor(max_workers=min(len(items), 8)) as executor:
        future_to_key = {
            executor.submit(score_answer, user_prompt, answer): key
            for key, answer in items
        }
        for future in as_completed(future_to_key):
            key = future_to_key[future]
            scores[key] = future.result()
    return scores