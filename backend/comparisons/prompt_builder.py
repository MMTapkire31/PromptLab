def build_prompt(prompt, prompt_type, examples=None, role=None):
    """Wrap the user's prompt according to the chosen prompt engineering technique.

    Raises ValueError if a technique is missing something it needs (e.g. examples).
    """
    if prompt_type == "chain-of-thought":
        return f"{prompt}\n\nLet's think step by step, then state the final answer clearly."

    if prompt_type == "role-based":
        role = (role or "").strip() or "an expert on this topic"
        return f"You are {role}. Answer the following the way that expert would.\n\n{prompt}"

    if prompt_type == "structured":
        return (
            f"{prompt}\n\n"
            "Format your answer exactly like this:\n"
            "Summary: <one sentence>\n"
            "Key points:\n- <point>\n- <point>\n- <point>\n"
            "Conclusion: <one sentence>"
        )

    if prompt_type in ("one-shot", "few-shot"):
        needed = 1 if prompt_type == "one-shot" else 2
        valid = [
            e for e in (examples or [])
            if isinstance(e, dict) and e.get("input") and e.get("output")
        ]
        if len(valid) < needed:
            raise ValueError(
                f"{prompt_type} needs at least {needed} example(s), each with an input and an output."
            )
        if prompt_type == "one-shot":
            valid = valid[:1]
        shots = "\n\n".join(f"Input: {e['input']}\nOutput: {e['output']}" for e in valid)
        return (
            f"Here are examples of the task:\n\n{shots}\n\n"
            f"Now do the same for this input.\nInput: {prompt}\nOutput:"
        )

    # zero-shot (and any unrecognised type) sends the prompt unchanged
    return prompt