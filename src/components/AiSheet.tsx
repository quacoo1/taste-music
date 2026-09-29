import { useEffect, useId, useState, type FormEvent } from "react";
import { PROVIDERS, type AiStatus, type AiSummary, type ProviderPreset, type ProviderStatus, type TestResult } from "../../shared/ai.ts";
import { chooseCurator, disconnectProvider, getAi, saveProvider, testProvider } from "../ai/manage.ts";
import { CheckIcon, CloseIcon, ExternalIcon, SproutIcon } from "./Icons.tsx";

interface Props {
  onClose: () => void;
  onChanged: (ai: AiSummary) => void;
}

export function AiSheet({ onClose, onChanged }: Props) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    getAi().then(
      (s) => {
        setStatus(s);
        setOpen(s.active);
      },
      (err) => setError((err as Error).message),
    );
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const apply = (s: AiStatus, ai: AiSummary) => {
    setStatus(s);
    onChanged(ai);
  };

  const useLite = async () => {
    try {
      const r = await chooseCurator("lite");
      apply(r.status, r.ai);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet ai-sheet" role="dialog" aria-modal="true" aria-labelledby="ai-title" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn ghost sheet-close" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
        <p className="eyebrow">Curation</p>
        <h2 id="ai-title">AI integrations</h2>
        <p className="muted">
          Pick the AI that chooses songs for your seeds and estimates their key, tempo and energy. Your keys are saved only in this browser and sent directly to the provider — never to Taste's server.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!status && !error && (
          <p className="job-label">
            <span className="spinner" aria-hidden /> Loading…
          </p>
        )}
        {status && (
          <ul className="providers">
            {PROVIDERS.map((preset) => (
              <ProviderRow
                key={preset.id}
                preset={preset}
                st={status.providers.find((p) => p.id === preset.id)!}
                active={status.active === preset.id}
                open={open === preset.id}
                onToggle={() => setOpen((o) => (o === preset.id ? null : preset.id))}
                onStatus={apply}
              />
            ))}
            <li className={`provider${status.active === null ? " is-active" : ""}`}>
              <div className="provider-head static">
                <span className="mono" style={{ background: "#E8EEDB" }} aria-hidden>
                  <SproutIcon size={18} />
                </span>
                <span className="provider-name">
                  <b>Lite mode</b>
                  <span>No AI: Deezer's artist radio, tempo where Deezer knows it</span>
                </span>
                {status.active === null ? (
                  <span className="chip active">Curating</span>
                ) : (
                  <button className="btn ghost sm" onClick={useLite}>
                    Use lite mode
                  </button>
                )}
              </div>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}

interface RowProps {
  preset: ProviderPreset;
  st: ProviderStatus;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  onStatus: (s: AiStatus, ai: AiSummary) => void;
}

function ProviderRow({ preset, st, active, open, onToggle, onStatus }: RowProps) {
  const [key, setKey] = useState("");
  const [model, setModel] = useState(st.model);
  const [baseUrl, setBaseUrl] = useState(st.baseUrl ?? "");
  const [busy, setBusy] = useState<"save" | "test" | "use" | "remove" | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const listId = useId();
  const bodyId = useId();

  useEffect(() => {
    setModel(st.model);
    setBaseUrl(st.baseUrl ?? "");
  }, [st.model, st.baseUrl]);

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      setResult({ ok: false, message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    setResult(null);
    run("save", async () => {
      const r = await saveProvider(preset.id, {
        apiKey: key.trim() || undefined,
        model,
        baseUrl: preset.editableBaseUrl ? baseUrl : undefined,
      });
      setKey("");
      setResult(r.test);
      onStatus(r.status, r.ai);
    });
  };

  const needsKey = preset.keyRequired && !key.trim() && !st.keyPreview;
  const needsModel = !model.trim() && !preset.defaultModel;
  const needsUrl = preset.editableBaseUrl && !baseUrl.trim();
  const failing = st.configured && st.lastTestOk === false;
  const statusLabel = active ? "Curating" : failing ? "Check setup" : st.configured ? "Connected" : null;

  return (
    <li className={`provider${active ? " is-active" : ""}${open ? " open" : ""}`}>
      <button
        className="provider-head"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`${preset.name}${statusLabel ? `, ${statusLabel.toLowerCase()}` : ", not connected"}`}
      >
        <span className="mono" style={{ background: preset.tint }} aria-hidden>
          {preset.monogram}
        </span>
        <span className="provider-name">
          <b>{preset.name}</b>
          <span className="truncate">{st.configured ? `${preset.maker} · ${st.model}` : preset.blurb}</span>
        </span>
        {statusLabel && <span className={`chip${active ? " active" : failing ? " warn" : ""}`}>{statusLabel}</span>}
        <span className="chevron" aria-hidden />
      </button>

      {open && (
        <form className="provider-body" id={bodyId} onSubmit={save}>
          {(preset.keyRequired || preset.id === "custom") && (
            <label className="field">
              <span className="field-label">
                API key{!preset.keyRequired && " (optional)"}
                {preset.keyUrl && (
                  <a href={preset.keyUrl} target="_blank" rel="noreferrer">
                    Get a key <ExternalIcon size={12} />
                  </a>
                )}
              </span>
              <input
                type="password"
                value={key}
                autoComplete="off"
                spellCheck={false}
                placeholder={st.keyPreview ? `Saved ${st.keyPreview} — paste a new key to replace it` : preset.keyPlaceholder ?? "Paste your key"}
                onChange={(e) => setKey(e.target.value)}
              />
              {preset.id === "ollama" || preset.id === "custom" ? null : <span className="field-note">Tip: set a spending limit on this key in your {preset.maker} dashboard.</span>}
            </label>
          )}
          {preset.editableBaseUrl && (
            <label className="field">
              <span className="field-label">Base URL</span>
              <input value={baseUrl} spellCheck={false} placeholder="https://your-server/v1" onChange={(e) => setBaseUrl(e.target.value)} />
              <span className="field-note">
                This page calls it straight from your browser, so it must allow requests from <code>{window.location.origin}</code>
                {preset.id === "ollama" ? (
                  <>
                    {" "}(start Ollama with <code>OLLAMA_ORIGINS={window.location.origin}</code>).
                  </>
                ) : (
                  "."
                )}
              </span>
            </label>
          )}
          <label className="field">
            <span className="field-label">Model</span>
            <input
              value={model}
              list={preset.models.length ? listId : undefined}
              spellCheck={false}
              placeholder={preset.defaultModel || (preset.id === "ollama" ? "e.g. qwen3 — any model you've pulled" : "model name")}
              onChange={(e) => setModel(e.target.value)}
            />
            {preset.models.length > 0 && (
              <datalist id={listId}>
                {preset.models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            )}
          </label>

          <div className="provider-actions">
            <button type="submit" className="btn dark sm" disabled={!!busy || needsKey || needsModel || needsUrl}>
              {busy === "save" ? <span className="spinner" aria-hidden /> : null}
              {st.configured ? "Save & test" : "Connect"}
            </button>
            {st.configured && !active && (
              <button
                type="button"
                className="btn ghost sm"
                disabled={!!busy}
                onClick={() =>
                  run("use", async () => {
                    const r = await chooseCurator(preset.id);
                    onStatus(r.status, r.ai);
                  })
                }
              >
                Use for curation
              </button>
            )}
            {st.configured && (
              <button
                type="button"
                className="btn ghost sm"
                disabled={!!busy}
                onClick={() =>
                  run("test", async () => {
                    setResult(null);
                    const r = await testProvider(preset.id);
                    setResult(r.test);
                    onStatus(r.status, r.ai);
                  })
                }
              >
                {busy === "test" ? <span className="spinner" aria-hidden /> : null}
                Test
              </button>
            )}
            {(st.keySource === "saved" || (!preset.keyRequired && st.configured)) && (
              <button
                type="button"
                className="btn ghost sm danger"
                disabled={!!busy}
                onClick={() =>
                  run("remove", async () => {
                    const r = await disconnectProvider(preset.id);
                    setResult(null);
                    onStatus(r.status, r.ai);
                  })
                }
              >
                Disconnect
              </button>
            )}
          </div>
          {result && (
            <p className={`test-result ${result.ok ? "ok" : "bad"}`} role="status">
              {result.ok ? <CheckIcon size={14} /> : <CloseIcon size={14} />}
              {result.message}
            </p>
          )}
        </form>
      )}
    </li>
  );
}
