# taste

Plant a few songs, grow a playlist. Taste takes 1–5 seed songs and grows a playlist that keeps one mood from the first note to the last. It orders the songs by key, tempo and energy so every song hands off smoothly to the next, then exports the result to Spotify or YouTube Music.

There are no accounts. Everything personal (AI keys, playlists, sign-ins, client IDs) stays in the visitor's browser.

## Quick start

```bash
npm install
npm run dev             # → http://127.0.0.1:5199
```

Open the app at **127.0.0.1**, not `localhost`. Spotify only accepts loopback redirect URIs written as an IP address.

## Deploy to Vercel

No environment variables or database are needed.

**From Git:** push the repo to GitHub, GitLab or Bitbucket and import it at <https://vercel.com/new>. `vercel.json` sets everything up, so keep the defaults.

**From your machine:**

```bash
npx vercel          # preview deployment
npx vercel --prod   # production
```

The build (`npm run build:vercel`) writes Vercel's [Build Output API](https://vercel.com/docs/build-output-api) layout:

- the Vite app as static files;
- the API bundled into a single Node function (`/api/*`, 60-second limit, streaming);
- routing, with a SPA fallback so `/callback` works, and security headers.

After the first production deploy, use your production domain for the export integrations. Preview URLs change on every deploy. Anyone who connects Spotify registers `https://<your-domain>/callback`; anyone who connects Google registers `https://<your-domain>` as the JavaScript origin. The app shows the exact values in its setup sheets.

Optional: set `SPOTIFY_CLIENT_ID` and/or `GOOGLE_CLIENT_ID` in the Vercel project to give every visitor a default app. Visitors can still paste their own client ID, which overrides it.

## Privacy model

| Data | Where it lives |
| --- | --- |
| AI API keys, chosen models | The visitor's browser (`localStorage`). Sent only to the AI provider, directly from the browser. |
| Seeds, playlists, recent list | The visitor's browser |
| Spotify tokens, client IDs | The visitor's browser. Spotify sign-in uses PKCE, so there's no client secret anywhere. |
| Google token | The page's memory only (Google Identity Services) |

The server stores nothing and has no user data. It only proxies public music catalogs that browsers can't reach directly:

- Deezer search, previews and song details;
- the iTunes Search fallback;
- YouTube Music matching.

Song titles and search terms pass through it; keys never do. It has a small per-IP rate limit.

**Clear my data** in the footer wipes everything Taste saved in that browser.

Because keys live in `localStorage`, pages are served with a strict Content Security Policy. Only the app's own scripts and Google's sign-in script can run. `connect-src` stays open to `https:` (and `localhost`) because visitors can point Taste at any AI endpoint. Visitors should still use keys with spending limits.

## How a playlist grows

1. **Seeds.** Search Deezer's catalog (Apple's iTunes Search is the fallback) and plant up to five songs.
2. **Curation.**
   - **With an AI connected** (see [AI integrations](#ai-integrations)): the browser asks the model what the seeds have in common: mood, texture, era and groove. It proposes ~40% more songs than needed, each with an estimated tempo, Camelot key, energy and valence, plus a one-line reason for the pick. The answer streams in as JSON, and each song is checked while the model is still writing.
   - **Without one (lite mode):** the server builds the pool from Deezer's artist radios, ranked by how many seeds agree on each song. Tempo comes from Deezer's measurements where available, and energy is estimated from loudness.
3. **Verification.** Every pick must resolve to a real recording (`/api/match`). Invented songs, live versions, karaoke and duplicates are dropped, and each artist is capped at two songs. Deezer's measured BPM replaces the model's estimate when they agree, accounting for half- and double-time.
4. **Sequencing** (`shared/harmony.ts`). Each hand-off is scored on:
   - **Harmonic compatibility on the Camelot wheel:** same key, adjacent keys, relative major/minor, energy-boost mixes.
   - **Tempo distance**, treating half and double time as equal.
   - **Energy jump.**

   The order is optimised against those scores and the chosen **energy shape** (Steady, Build, Journey, Unwind). It uses greedy construction from every possible opener, then local search (relocate, swap, segment reversal).
5. **Listening.** 30-second previews play back to back with a 4-second equal-power crossfade.

You can drag songs to reorder them, swap in the best-fitting alternative, remove songs, rename the playlist and re-sequence.

## AI integrations

Click the status pill in the top bar (or the note under **Grow**) to open **AI integrations**. Paste a key, pick a model, and press **Connect**. The browser tests the key against the provider and, if it works, makes that provider the curator. You can switch between connected providers at any time, or choose lite mode.

| Provider | How the browser talks to it | Default model |
| --- | --- | --- |
| Claude (Anthropic) | Anthropic SDK (browser mode), structured output | `claude-opus-5-5` |
| OpenAI | Responses API, strict JSON schema | `gpt-6-sol` |
| Gemini (Google) | Gemini's OpenAI-compatible endpoint | `gemini-3.8-flash` |
| OpenRouter | Chat Completions | `anthropic/claude-sonnet-5.5` |
| Groq | Chat Completions | `openai/gpt-oss-120b` |
| Mistral | Chat Completions | `mistral-medium-latest` |
| DeepSeek | Chat Completions | `deepseek-v4-pro` |
| Grok (xAI) | Chat Completions | `grok-4.7` |
| Ollama | Local Chat Completions, no key | any model you've pulled |
| Custom | Any OpenAI-compatible `/chat/completions` endpoint (LM Studio, vLLM, Together, Fireworks…) | you choose |

All the hosted providers above accept direct browser requests (CORS). Local servers must allow the site's origin too. For example, start Ollama with `OLLAMA_ORIGINS=https://<your-domain>`, or `http://127.0.0.1:5199` when running locally. The Claude SDK and the curation code are loaded only when needed.

Every model field accepts any model ID the provider serves. For Chat Completions providers, Taste asks for a strict JSON schema first. If the provider doesn't support that, it falls back to JSON mode, then to plain text with the shape spelled out in the prompt.

If the curator fails (for example a bad key, an unknown model, rate limits, or Ollama not running), that playlist grows in lite mode and Taste tells you why. A provider whose last connection test failed is never chosen automatically.

## Export

### YouTube Music: works with no setup

**Open in YouTube Music** matches every song on YouTube Music, then opens them as a queue in running order. Tap **Save** in YouTube Music to keep the playlist.

**Save to my library** writes the playlist straight into your account. It needs a Google OAuth client (the app's setup sheet walks through it):

1. Enable **YouTube Data API v3**.
2. Configure the consent screen and add yourself as a test user.
3. Create a **Web application** client whose Authorized JavaScript origin is the site's origin.
4. Paste its Client ID into the app.

Songs are matched without spending API quota. Writing the playlist costs about 50 quota units per song, out of the free 10,000 per day.

### Spotify

1. Create an app at <https://developer.spotify.com/dashboard> and choose **Web API**.
2. Add `https://<your-domain>/callback` as a Redirect URI.
3. Add your Spotify account under **User Management**.
4. Paste the Client ID into the app.

Taste signs in with PKCE entirely in the browser, so no client secret is needed. It creates a private playlist, adds the songs in order and uploads the generated flower cover as the playlist image.

Spotify limits new apps to **Development Mode**: the app owner needs Premium, and only a handful of allowlisted users can sign in. That's why every visitor can bring their own client ID instead of sharing yours.

Every export shows which songs couldn't be matched. **Copy track list** and **Download CSV** work anywhere.

## Configuration

All optional.

| Variable | Purpose |
| --- | --- |
| `SPOTIFY_CLIENT_ID` | Site-wide default Spotify app (visitors can override it) |
| `GOOGLE_CLIENT_ID` | Site-wide default Google OAuth client (visitors can override it) |
| `HOST` / `PORT` | Local server only. Defaults to `127.0.0.1:5199`. |

## Scripts

- `npm run dev`: API plus the Vite dev middleware on one port.
- `npm run build`, then `npm start`: production build served locally, with the same security headers as Vercel.
- `npm run build:vercel`: builds `.vercel/output` for deployment.
- `npm run typecheck`

## Layout

```
server/   Stateless API (Express): catalog search, previews, /api/match, lite mode, YouTube matching
          app.ts is shared by the local server (index.ts) and the Vercel function (vercel.ts)
src/ai/   Browser-side curation: provider store (localStorage), Anthropic / OpenAI / Chat Completions
          transports, prompt + stream parser, and the grow pipeline
shared/   Types, AI provider presets, harmony (Camelot / tempo / energy + sequencer), fuzzy matching
src/      React app: composer, growing garden, playlist view, player island, exports
scripts/  build-vercel.mjs (Build Output API)
```

## Caveats

- The AI's key, tempo and energy values are informed estimates, not audio analysis. Smaller or local models suggest songs that don't exist more often; those are dropped during verification, which can leave a shorter playlist. Transitions whose key and tempo are both unknown are shown as *unrated* rather than guessed.
- Everyone's catalog lookups come from the server's IP addresses, so heavy traffic can hit Deezer's rate limit (about 50 requests per 5 seconds).
- YouTube Music search uses the same unauthenticated endpoint as the music.youtube.com web client. YouTube may change it, or treat requests from cloud IPs differently than from home connections.
- Previews come from Deezer (links re-signed on every play) and Apple. Some songs have no preview and are skipped during playback.
- The generative cover art is original: procedurally painted flowers in one of seven mood palettes.
