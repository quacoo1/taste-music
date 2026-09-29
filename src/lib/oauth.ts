/**
 * Popup-based OAuth: the provider redirects the popup to /callback, which
 * hands the query params back to this tab and closes. Delivery uses a
 * BroadcastChannel, window.opener and a storage event, because some sign-in
 * pages sever window.opener. If the popup is blocked we fall back to a
 * full-page redirect and resume after returning (see main.tsx / ExportPanel).
 */
import { load, remove, save } from "./storage.ts";

export const OAUTH_MESSAGE = "taste-oauth";
export const OAUTH_RESUME_KEY = "taste:oauth-resume";
const MODE_KEY = "taste:oauth-mode";
const CALLBACK_KEY = "taste:oauth-callback";

export function openAuthPopup(url: string): Promise<URLSearchParams> {
  const w = 480;
  const h = 720;
  const left = window.screenX + (window.outerWidth - w) / 2;
  const top = window.screenY + (window.outerHeight - h) / 2;
  save(MODE_KEY, "popup");
  const popup = window.open(url, "taste-auth", `width=${w},height=${h},left=${left},top=${top}`);

  if (!popup) {
    save(MODE_KEY, "redirect");
    window.location.assign(url);
    return new Promise(() => {});
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const channel = "BroadcastChannel" in window ? new BroadcastChannel(OAUTH_MESSAGE) : null;
    const finish = (params: Record<string, string>) => {
      if (settled) return;
      settled = true;
      cleanup();
      remove(CALLBACK_KEY);
      resolve(new URLSearchParams(params));
    };
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === OAUTH_MESSAGE && (e.origin === window.location.origin || e.origin === "")) finish(e.data.params);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== CALLBACK_KEY || !e.newValue) return;
      try {
        finish(JSON.parse(e.newValue).params);
      } catch {
        /* ignore */
      }
    };
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Sign-in timed out. Try again."));
    }, 180_000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
      channel?.close();
    };
    if (channel) channel.onmessage = onMessage;
    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
  });
}

/** Runs on /callback. Returns true if this window was a popup that has handed off its result. */
export function handleOAuthCallback(): boolean {
  const params = Object.fromEntries(new URLSearchParams(window.location.search));
  const mode = load<string>(MODE_KEY, "redirect");
  remove(MODE_KEY);
  if (mode === "popup") {
    const msg = { type: OAUTH_MESSAGE, params };
    try {
      const ch = new BroadcastChannel(OAUTH_MESSAGE);
      ch.postMessage(msg);
      ch.close();
    } catch {
      /* ignore */
    }
    try {
      window.opener?.postMessage(msg, window.location.origin);
    } catch {
      /* ignore */
    }
    save(CALLBACK_KEY, { params, at: Date.now() });
    setTimeout(() => window.close(), 150);
    return true;
  }
  try {
    sessionStorage.setItem("taste:oauth-params", window.location.search.slice(1));
  } catch {
    /* ignore */
  }
  window.location.replace("/#playlist");
  return false;
}

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function randomString(bytes = 48) {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}
