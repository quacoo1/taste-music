/** Errors and streaming helpers shared by the fetch-based transports. */

export type ProviderErrorKind = "auth" | "model" | "rate" | "network" | "refusal" | "truncated" | "request" | "server";

export class ProviderError extends Error {
  constructor(
    public kind: ProviderErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export async function httpError(res: Response): Promise<ProviderError> {
  let message = "";
  try {
    const text = await res.text();
    try {
      let j = JSON.parse(text);
      if (Array.isArray(j)) j = j[0];
      message = j?.error?.message ?? j?.error ?? j?.message ?? j?.detail ?? text;
      if (typeof message !== "string") message = JSON.stringify(message);
    } catch {
      message = text;
    }
  } catch {
    /* no body */
  }
  message = (message || res.statusText || `HTTP ${res.status}`).slice(0, 300);
  const kind: ProviderErrorKind =
    res.status === 401 || res.status === 403
      ? "auth"
      : res.status === 404
        ? "model"
        : res.status === 429
          ? "rate"
          : res.status >= 500
            ? "server"
            : "request";
  return new ProviderError(kind, message, res.status);
}

export async function send(url: string, init: RequestInit, what: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    // Browsers report network failures and blocked cross-origin requests the same way.
    throw new ProviderError("network", `Couldn't reach ${what}`);
  }
}

/** Parses a text/event-stream body into { event, data } messages. */
export async function* readSSE(res: Response): AsyncGenerator<{ event: string; data: string }> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const raw = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      let event = "message";
      const data: string[] = [];
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length) yield { event, data: data.join("\n") };
    }
  }
}
