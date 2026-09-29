import { useEffect, useState } from "react";
import type { AppConfig } from "../../shared/types.ts";
import { loadClientIds, saveClientId, type ClientIds } from "../lib/clients.ts";
import { CheckIcon, CloseIcon, CopyIcon } from "./Icons.tsx";

export type SetupTopic = "spotify" | "google";

function Copyable({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copyable"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
    >
      <code>{value}</code>
      {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
    </button>
  );
}

function ClientIdField({ which, siteDefault, placeholder, onSaved }: { which: keyof ClientIds; siteDefault: string | null; placeholder: string; onSaved: (ids: ClientIds) => void }) {
  const [value, setValue] = useState(() => loadClientIds()[which] ?? "");
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="client-id"
      onSubmit={(e) => {
        e.preventDefault();
        onSaved(saveClientId(which, value));
        setSaved(true);
        setTimeout(() => setSaved(false), 1600);
      }}
    >
      <div className="field">
        <input value={value} spellCheck={false} autoComplete="off" placeholder={siteDefault ? "Using this site's default app — paste yours to override" : placeholder} onChange={(e) => setValue(e.target.value)} aria-label="Client ID" />
      </div>
      <button className="btn dark sm" type="submit">
        {saved ? <CheckIcon size={15} /> : null}
        {saved ? "Saved" : "Save"}
      </button>
    </form>
  );
}

interface Props {
  topic: SetupTopic;
  siteConfig: AppConfig | null;
  onClose: () => void;
  onSaved: (ids: ClientIds) => void;
}

export function SetupSheet({ topic, siteConfig, onClose, onSaved }: Props) {
  const origin = window.location.origin;
  const onLocalhost = window.location.hostname === "localhost";
  const redirectOrigin = onLocalhost ? origin.replace("localhost", "127.0.0.1") : origin;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="setup-title" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn ghost sheet-close" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>

        {topic === "spotify" && (
          <>
            <p className="eyebrow">Bring your own Spotify app</p>
            <h2 id="setup-title">Connect Spotify</h2>
            <p className="muted">
              Taste has no accounts. Exports use a free Spotify app you create, and you sign in to Spotify directly from this browser. The client ID is saved here and nowhere else.
            </p>
            {onLocalhost && (
              <p className="warn">
                Spotify only accepts loopback redirects on <b>127.0.0.1</b>. Open Taste at <a href={redirectOrigin}>{redirectOrigin}</a> first.
              </p>
            )}
            <ol className="steps">
              <li>
                Open the <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">Spotify developer dashboard</a> and create an app. Pick <b>Web API</b>.
              </li>
              <li>
                Add this Redirect URI:
                <Copyable value={`${redirectOrigin}/callback`} />
              </li>
              <li className="muted">Under <b>User Management</b>, add the Spotify account you'll export to. New apps run in Development Mode, which also requires the app owner to have Premium.</li>
              <li>
                Paste the app's Client ID:
                <ClientIdField which="spotify" siteDefault={siteConfig?.spotifyClientId ?? null} placeholder="Spotify Client ID" onSaved={onSaved} />
              </li>
            </ol>
          </>
        )}

        {topic === "google" && (
          <>
            <p className="eyebrow">Bring your own Google app</p>
            <h2 id="setup-title">Save to YouTube Music</h2>
            <p className="muted">
              <b>Open in YouTube Music</b> works without any setup. To save straight into your library, create a Google OAuth client. The client ID is saved in this browser only.
            </p>
            <ol className="steps">
              <li>
                In <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer">Google Cloud Console</a>, enable the <b>YouTube Data API v3</b> for a project.
              </li>
              <li>Configure the OAuth consent screen (External) and add your Google account as a test user.</li>
              <li>
                Create an OAuth client ID of type <b>Web application</b> with this Authorized JavaScript origin:
                <Copyable value={origin} />
              </li>
              <li>
                Paste the Client ID:
                <ClientIdField which="google" siteDefault={siteConfig?.googleClientId ?? null} placeholder="….apps.googleusercontent.com" onSaved={onSaved} />
              </li>
              <li className="muted">Each save spends about 50 quota units per song from YouTube's free 10,000 daily units. Songs are matched without using quota.</li>
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
