import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { PlayerProvider } from "./components/Player.tsx";
import { handleOAuthCallback } from "./lib/oauth.ts";
import "./styles.css";

const root = document.getElementById("root")!;

if (window.location.pathname === "/callback") {
  if (handleOAuthCallback()) {
    root.innerHTML = `<div class="callback-note"><p>Connected. You can close this window.</p></div>`;
  }
} else {
  createRoot(root).render(
    <StrictMode>
      <PlayerProvider>
        <App />
      </PlayerProvider>
    </StrictMode>,
  );
}
