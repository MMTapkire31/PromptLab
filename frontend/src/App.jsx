import { useState } from "react";
import { comparePrompts } from "./api";

const PROMPT_TYPES = [
  "zero-shot",
  "one-shot",
  "few-shot",
  "chain-of-thought",
  "role-based",
  "structured",
];

const MODELS = [
  { id: "openai/gpt-oss-20b", provider: "Groq" },
  { id: "openai/gpt-oss-120b", provider: "Groq" },
  { id: "qwen/qwen3.8-27b", provider: "Groq" },
  { id: "allam-2-7b", provider: "Groq" },
  { id: "gemini-3.8-flash", provider: "Gemini" },
  { id: "gemini-3.1-flash-lite", provider: "Gemini" },
  { id: "ministral-8b-latest", provider: "Mistral" },
  { id: "ministral-14b-latest", provider: "Mistral" },
];

function App() {
  const [prompt, setPrompt] = useState("");
  const [promptType, setPromptType] = useState("zero-shot");
  const [selectedModels, setSelectedModels] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const toggleModel = (id) => {
    setSelectedModels((current) =>
      current.includes(id) ? current.filter((m) => m !== id) : [...current, id]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const data = await comparePrompts({
        prompt,
        promptType,
        models: selectedModels,
      });
      setResults(data.results);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = prompt.trim() !== "" && selectedModels.length > 0;

  return (
    <div>
      <h1>PromptLab</h1>
      <p>Compare prompt engineering techniques across LLMs.</p>

      <form onSubmit={handleSubmit}>
        <div>
          <label>
            Prompt
            <br />
            <textarea
              rows={5}
              cols={60}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Type your prompt here..."
            />
          </label>
        </div>

        <div>
          <label>
            Prompt type{" "}
            <select
              value={promptType}
              onChange={(e) => setPromptType(e.target.value)}
            >
              {PROMPT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <p>Models</p>
          {MODELS.map((m) => (
            <label key={m.id} style={{ display: "block" }}>
              <input
                type="checkbox"
                checked={selectedModels.includes(m.id)}
                onChange={() => toggleModel(m.id)}
              />{" "}
              {m.id} ({m.provider})
            </label>
          ))}
        </div>

        <button type="submit" disabled={!canSubmit || loading}>
          {loading ? "Comparing..." : "Compare"}
        </button>
      </form>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {results.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "16px",
            marginTop: "24px",
          }}
        >
          {results.map((r) => (
            <div
              key={r.model_name}
              style={{ border: "1px solid #ccc", borderRadius: 8, padding: 12 }}
            >
              <h3>{r.model_name}</h3>
              <small>
                {r.provider} · {Math.round(r.latency_ms)} ms
                {r.output_tokens != null && ` · ${r.output_tokens} output tokens`}
              </small>
              {r.error ? (
                <p style={{ color: "red" }}>{r.error}</p>
              ) : (
                <p style={{ whiteSpace: "pre-wrap" }}>{r.output_text}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;