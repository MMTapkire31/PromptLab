def build_prompt(prompt: str, prompt_type: str) -> str:
    """Wrap the user's prompt according to the chosen prompt engineering technique."""
    if prompt_type == "chain-of-thought":
        return f"{prompt}\n\nLet's think step by step, then state the final answer clearly."
    # zero-shot (and any type not implemented yet) sends the prompt unchanged
    return prompt