const API_BASE = "http://127.0.0.1:8000/api";

export async function comparePrompts({ prompt, promptType, models, examples, role }) {
  const response = await fetch(`${API_BASE}/compare/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      prompt_type: promptType,
      models,
      examples,
      role,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}