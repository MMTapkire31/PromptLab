import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { comparePrompts, compareMatrix, fetchModels } from "./api";

const PROMPT_TYPES = [
  "zero-shot",
  "one-shot",
  "few-shot",
  "chain-of-thought",
  "role-based",
  "structured",
];

const HISTORY_KEY = "promptlab_history";
const MAX_HISTORY = 50;

const emptyExample = () => ({ input: "", output: "" });

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function App() {
  const [prompt, setPrompt] = useState("");
  const [promptType, setPromptType] = useState("zero-shot");
  const [selectedModels, setSelectedModels] = useState([]);
  const [role, setRole] = useState("");
  const [examples, setExamples] = useState([emptyExample(), emptyExample()]);

  const [models, setModels] = useState([]); // loaded from the backend
  const [modelsStatus, setModelsStatus] = useState("loading"); // loading | ready | error

  const [lastRun, setLastRun] = useState(null); // what the chat area is showing
  const [results, setResults] = useState([]);
  const [finalPrompt, setFinalPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState([]); // model ids being retried
  const [error, setError] = useState(null);

  const [history, setHistory] = useState(loadHistory);
  const [activeId, setActiveId] = useState(null);

  // --- new: matrix mode ---
  const [mode, setMode] = useState("single"); // "single" | "matrix"
  const [selectedTypes, setSelectedTypes] = useState(["zero-shot"]);
  const [matrix, setMatrix] = useState(null);

  const chatEndRef = useRef(null);

  const providers = [...new Set(models.map((m) => m.provider))];

  // Load the model list from the backend once
  useEffect(() => {
    fetchModels()
      .then((list) => {
        setModels(list);
        setModelsStatus("ready");
      })
      .catch(() => setModelsStatus("error"));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [loading, results]);

  // Save history to the browser whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* storage full or blocked: history just won't persist */
    }
  }, [history]);

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

  // --- new: technique toggle for matrix mode ---
  const toggleType = (t) => {
    setSelectedTypes((current) =>
      current.includes(t) ? current.filter((x) => x !== t) : [...current, t]
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
    setActiveId(null);
    setMatrix(null);
  };

  const openEntry = (entry) => {
    if (loading || retrying.length > 0) return;
    setActiveId(entry.id);
    setLastRun({
      prompt: entry.prompt,
      promptType: entry.promptType,
      models: entry.models,
      role: entry.role || undefined,
      examples: entry.examples && entry.examples.length ? entry.examples : undefined,
    });
    setResults(entry.results);
    setFinalPrompt(entry.finalPrompt);
    setError(null);

    // Restore the form so the run can be tweaked and repeated.
    // Skip models the backend no longer offers, or the next run would be rejected.
    const available = models.map((m) => m.id);
    setPrompt(entry.prompt);
    setPromptType(entry.promptType);
    setSelectedModels(entry.models.filter((id) => available.includes(id)));
    setRole(entry.role || "");
    const padded = [...(entry.examples || [])];
    while (padded.length < 2) padded.push(emptyExample());
    setExamples(padded);
  };

  const deleteEntry = (id, e) => {
    e.stopPropagation();
    setHistory((h) => h.filter((x) => x.id !== id));
    if (activeId === id) resetChat();
  };

  const clearHistory = () => {
    if (window.confirm("Delete all saved comparisons?")) {
      setHistory([]);
      setActiveId(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || loading) return;
    const runRole = promptType === "role-based" ? role : undefined;
    const runExamples = needsExamples ? filledExamples : undefined;

    setLoading(true);
    setError(null);
    setResults([]);
    setFinalPrompt("");
    setActiveId(null);
    setLastRun({
      prompt,
      promptType,
      models: selectedModels,
      role: runRole,
      examples: runExamples,
    });
    try {
      const data = await comparePrompts({
        prompt,
        promptType,
        models: selectedModels,
        examples: runExamples,
        role: runRole,
      });
      setResults(data.results);
      setFinalPrompt(data.final_prompt);

      const entry = {
        id: Date.now(),
        createdAt: new Date().toISOString(),
        prompt,
        promptType,
        role: runRole || "",
        examples: runExamples || [],
        models: selectedModels,
        finalPrompt: data.final_prompt,
        results: data.results,
      };
      setHistory((h) => [entry, ...h].slice(0, MAX_HISTORY));
      setActiveId(entry.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

    const handleMatrixSubmit = async (e) => {
    e.preventDefault();
    if (prompt.trim() === "" || selectedModels.length === 0 || selectedTypes.length === 0) return;
    if (loading) return;

    setLoading(true);
    setError(null);
    setMatrix(null);
    setLastRun({ prompt, promptType: null, models: selectedModels });
    try {
      const data = await compareMatrix({
        prompt,
        promptTypes: selectedTypes,
        models: selectedModels,
        examples: filledExamples,
        role: role || undefined,
      });
      setMatrix(data.matrix);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Re-run a single model from the current comparison
  const retryModel = async (modelId) => {
    if (!lastRun || retrying.includes(modelId)) return;
    setRetrying((r) => [...r, modelId]);
    try {
      const data = await comparePrompts({
        prompt: lastRun.prompt,
        promptType: lastRun.promptType,
        models: [modelId],
        examples: lastRun.examples,
        role: lastRun.role,
      });
      const fresh = data.results[0];
      const swap = (list) =>
        list.map((r) => (r.model_name === modelId ? fresh : r));
      setResults(swap);
      // keep the saved history entry in sync with the new result
      setHistory((h) =>
        h.map((x) => (x.id === activeId ? { ...x, results: swap(x.results) } : x))
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setRetrying((r) => r.filter((id) => id !== modelId));
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

        <div className="mode-switch">
          <button
            type="button"
            className={mode === "single" ? "on" : ""}
            onClick={() => setMode("single")}
          >
            Single
          </button>
          <button
            type="button"
            className={mode === "matrix" ? "on" : ""}
            onClick={() => setMode("matrix")}
          >
            Matrix
          </button>
        </div>

        <div className="history">
          {history.length === 0 ? (
            <div className="history-empty">Your comparisons will appear here.</div>
          ) : (
            <>
              <div className="history-head">
                <span>History</span>
                <button className="ghost" onClick={clearHistory}>
                  Clear all
                </button>
              </div>
              {history.map((h) => (
                <div
                  key={h.id}
                  className={`history-item ${h.id === activeId ? "active" : ""}`}
                  onClick={() => openEntry(h)}
                  title={new Date(h.createdAt).toLocaleString()}
                >
                  <div className="history-title">{h.prompt}</div>
                  <div className="history-sub">
                    <span className="badge">{h.promptType}</span>
                    <span>{h.models.length} models</span>
                    <button
                      className="x"
                      onClick={(e) => deleteEntry(h.id, e)}
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </aside>

      <main className="main">
        <div className="chat">
          <div className="chat-inner">
            {!lastRun ? (
              <div className="empty">
                <h2>What do you want to test?</h2>
                <p>
                  {mode === "single"
                    ? "Write a prompt, pick a technique and a few models, then compare."
                    : "Write a prompt, pick several techniques and models, and see them all at once."}
                </p>
              </div>
            ) : mode === "single" || !matrix ? (
              <>
                <div className="user-bubble">
                  {lastRun.promptType && <div className="badge">{lastRun.promptType}</div>}
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
                    results.map((r) => {
                      const isRetrying = retrying.includes(r.model_name);
                      return (
                        <div
                          className={`card ${r.error && !isRetrying ? "error" : ""}`}
                          key={r.model_name}
                        >
                          <h3>{r.model_name}</h3>
                          <div className="meta">
                            {isRetrying
                              ? "retrying…"
                              : `${r.provider} · ${Math.round(r.latency_ms)} ms${
                                  r.output_tokens != null
                                    ? ` · ${r.output_tokens} output tokens`
                                    : ""
                                }`}
                          </div>
                          {isRetrying ? (
                            <div className="dots">
                              <span />
                              <span />
                              <span />
                            </div>
                          ) : r.error ? (
                            <>
                              <div className="err">{r.error}</div>
                              <button
                                type="button"
                                className="ghost"
                                style={{ marginTop: 10 }}
                                onClick={() => retryModel(r.model_name)}
                              >
                                Retry
                              </button>
                            </>
                          ) : (
                            <div className="card-body">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {r.output_text}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </>
            ) : (
              <>
                <div className="user-bubble">
                  <div>{lastRun.prompt}</div>
                </div>

                {error && <p className="err">Error: {error}</p>}

                <div className="matrix-table-wrap">
                  <table className="matrix-table">
                    <thead>
                      <tr>
                        <th>Technique</th>
                        {lastRun.models.map((id) => (
                          <th key={id}>{id}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.map((row) => (
                        <tr key={row.prompt_type}>
                          <td className="tech-cell">
                            <span className="badge">{row.prompt_type}</span>
                          </td>
                          {row.error ? (
                            <td colSpan={lastRun.models.length} className="err">
                              {row.error}
                            </td>
                          ) : (
                            lastRun.models.map((id) => {
                              const cell = row.results.find((r) => r.model_name === id);
                              return (
                                <td key={id} className="matrix-cell">
                                  {!cell ? (
                                    <span className="tagline">no result</span>
                                  ) : cell.error ? (
                                    <span className="err">{cell.error}</span>
                                  ) : (
                                    <>
                                      <div className="meta">
                                        {Math.round(cell.latency_ms)} ms
                                        {cell.output_tokens != null &&
                                          ` · ${cell.output_tokens} tok`}
                                      </div>
                                      <div className="card-body">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                          {cell.output_text}
                                        </ReactMarkdown>
                                      </div>
                                    </>
                                  )}
                                </td>
                              );
                            })
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        <div className="composer-wrap">
          <form
            className="composer"
            onSubmit={mode === "single" ? handleSubmit : handleMatrixSubmit}
          >
            {(promptType === "role-based" || needsExamples || mode === "matrix") && (
              <div className="extras">
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Role (used only if a role-based technique is selected)"
                />
                <div className="tagline">
                  Examples (used only if a one-shot/few-shot technique is selected)
                </div>
                {examples.map((ex, i) => (
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
                    {examples.length > 2 && (
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
                <div>
                  <button type="button" className="ghost" onClick={addExample}>
                    + Add example
                  </button>
                </div>
              </div>
            )}

            <textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your prompt here... (Enter to send, Shift+Enter for a new line)"
            />

            {modelsStatus === "loading" && (
              <div className="tagline">Loading models…</div>
            )}
            {modelsStatus === "error" && (
              <div className="err">
                Couldn't load the model list. Is the backend running on port 8000?
              </div>
            )}

            {providers.map((p) => (
              <div className="row" key={p}>
                <span className="provider-label">{p}</span>
                {models
                  .filter((m) => m.provider === p)
                  .map((m) => (
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

            {mode === "single" ? (
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
            ) : (
              <div className="row">
                <span className="provider-label">Techniques</span>
                {PROMPT_TYPES.map((t) => (
                  <span
                    key={t}
                    className={`chip ${selectedTypes.includes(t) ? "on" : ""}`}
                    onClick={() => toggleType(t)}
                  >
                    {t}
                  </span>
                ))}
                <button
                  className="send"
                  type="submit"
                  disabled={
                    loading ||
                    prompt.trim() === "" ||
                    selectedModels.length === 0 ||
                    selectedTypes.length === 0
                  }
                >
                  {loading ? "Comparing..." : "Compare"}
                </button>
              </div>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}

export default App;