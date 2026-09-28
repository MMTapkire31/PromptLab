import { useEffect, useRef, useState } from "react";
import { comparePrompts } from "./api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const PROMPT_TYPES = [
  "zero-shot",
  "one-shot",
  "few-shot",
  "chain-of-thought",
  "role-based",
  "structured",
];

const PROVIDERS = ["Groq", "Gemini", "Mistral"];

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

const emptyExample = () => ({ input: "", output: "" });

function App() {
  const [prompt, setPrompt] = useState("");
  const [promptType, setPromptType] = useState("zero-shot");
  const [selectedModels, setSelectedModels] = useState([]);
  const [role, setRole] = useState("");
  const [examples, setExamples] = useState([emptyExample(), emptyExample()]);

  const [lastRun, setLastRun] = useState(null); // what the chat area is showing
  const [results, setResults] = useState([]);
  const [finalPrompt, setFinalPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [loading, results]);

  const needsExamples = promptType === "one-shot" || promptType === "few-shot";
  const neededExamples = promptType === "one-shot" ? 1 : 2;
  const visibleExamples = promptType === "one-shot" ? examples.slice(0, 1) : examples;
  const filledExamples = visibleExamples.filter(
    (e) => e.input.trim() && e.output.trim()
  );
  const examplesOk = !needsExamples || filledExamples.length >= neededExamples;
  const canSubmit = prompt.trim() !== "" && selectedModels.length > 0 && examplesOk;

  const toggleModel = (id) => {
    setSelectedModels((current) =>
      current.includes(id) ? current.filter((m) => m !== id) : [...current, id]
    );
  };

  const updateExample = (index, field, value) => {
    setExamples((current) =>
      current.map((e, i) => (i === index ? { ...e, [field]: value } : e))
    );
  };
  const addExample = () => setExamples((current) => [...current, emptyExample()]);
  const removeExample = (index) =>
    setExamples((current) => current.filter((_, i) => i !== index));

  const resetChat = () => {
    setLastRun(null);
    setResults([]);
    setFinalPrompt("");
    setError(null);
    setPrompt("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setFinalPrompt("");
    setLastRun({ prompt, promptType, models: selectedModels });
    try {
      const data = await comparePrompts({
        prompt,
        promptType,
        models: selectedModels,
        examples: needsExamples ? filledExamples : undefined,
        role: promptType === "role-based" ? role : undefined,
      });
      setResults(data.results);
      setFinalPrompt(data.final_prompt);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      handleSubmit(e);
    }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          Prompt<span>Lab</span>
        </div>
        <div className="tagline">Compare prompt engineering techniques across LLMs.</div>
        <button className="new-btn" onClick={resetChat}>
          + New comparison
        </button>
        <div className="history-empty">History will appear here.</div>
      </aside>

      <main className="main">
        <div className="chat">
          <div className="chat-inner">
            {!lastRun ? (
              <div className="empty">
                <h2>What do you want to test?</h2>
                <p>Write a prompt, pick a technique and a few models, then compare.</p>
              </div>
            ) : (
              <>
                <div className="user-bubble">
                  <div className="badge">{lastRun.promptType}</div>
                  <div>{lastRun.prompt}</div>
                </div>

                {finalPrompt && (
                  <details className="sent-prompt">
                    <summary>Prompt actually sent to the models</summary>
                    <pre>{finalPrompt}</pre>
                  </details>
                )}

                {error && <p className="err">Error: {error}</p>}

                <div className="grid">
                  {loading &&
                    lastRun.models.map((id) => (
                      <div className="card" key={id}>
                        <h3>{id}</h3>
                        <div className="meta">thinking…</div>
                        <div className="dots">
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                    ))}

                  {!loading &&
                    results.map((r) => (
                      <div
                        className={`card ${r.error ? "error" : ""}`}
                        key={r.model_name}
                      >
                        <h3>{r.model_name}</h3>
                        <div className="meta">
                          {r.provider} · {Math.round(r.latency_ms)} ms
                          {r.output_tokens != null &&
                            ` · ${r.output_tokens} output tokens`}
                        </div>
                        {r.error ? (
                          <div className="err">{r.error}</div>
                        ) : (
                          <div className="card-body">
                           <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.output_text}</ReactMarkdown>
                              </div>
                        )}
                      </div>
                    ))}
                </div>
              </>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={handleSubmit}>
            {(promptType === "role-based" || needsExamples) && (
              <div className="extras">
                {promptType === "role-based" && (
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="Role (optional), e.g. a high school physics teacher"
                  />
                )}
                {needsExamples && (
                  <>
                    <div className="tagline">
                      Examples ({promptType === "one-shot" ? "1 needed" : "at least 2 needed"})
                    </div>
                    {visibleExamples.map((ex, i) => (
                      <div className="example-row" key={i}>
                        <input
                          type="text"
                          value={ex.input}
                          onChange={(e) => updateExample(i, "input", e.target.value)}
                          placeholder="Example input"
                        />
                        <input
                          type="text"
                          value={ex.output}
                          onChange={(e) => updateExample(i, "output", e.target.value)}
                          placeholder="Expected output"
                        />
                        {promptType === "few-shot" && examples.length > 2 && (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => removeExample(i)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    {promptType === "few-shot" && (
                      <div>
                        <button type="button" className="ghost" onClick={addExample}>
                          + Add example
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your prompt here... (Enter to send, Shift+Enter for a new line)"
            />

            {PROVIDERS.map((p) => (
              <div className="row" key={p}>
                <span className="provider-label">{p}</span>
                {MODELS.filter((m) => m.provider === p).map((m) => (
                  <span
                    key={m.id}
                    className={`chip ${selectedModels.includes(m.id) ? "on" : ""}`}
                    onClick={() => toggleModel(m.id)}
                  >
                    {m.id}
                  </span>
                ))}
              </div>
            ))}

            <div className="row">
              <select value={promptType} onChange={(e) => setPromptType(e.target.value)}>
                {PROMPT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button className="send" type="submit" disabled={!canSubmit || loading}>
                {loading ? "Comparing..." : "Compare"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

export default App;