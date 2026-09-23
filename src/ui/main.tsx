import { createRoot } from "react-dom/client";
import App from "./App";
import { RouterProvider } from "./router";
import { StoreContext } from "./useStore";
import { getCapability } from "./platform";
import { claudeBackend, type ClaudeDb } from "@/store/claudeBackend";
import { localBackend } from "@/store/localBackend";
import { createStore } from "@/store/store";

async function start() {
  const root = createRoot(document.getElementById("root")!);
  root.render(
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", fontFamily: "system-ui", color: "#6b635c" }}>
      <p>☕ Opening your cafes…</p>
    </div>,
  );
  // Inside Claude: save to the app's own database in your account.
  // Anywhere else (a saved copy, tests): save in this browser.
  const db = await getCapability<ClaudeDb>("db");
  const store = createStore(db ? claudeBackend(db) : localBackend());
  root.render(
    <StoreContext.Provider value={store}>
      <RouterProvider>
        <App />
      </RouterProvider>
    </StoreContext.Provider>,
  );
}

// In the Android app, the start-up script may hand over to a newer downloaded version instead.
const w = window as unknown as { __CJF_SKIP__?: boolean; __CJF_START__?: () => void };
if (w.__CJF_SKIP__) w.__CJF_START__ = () => void start();
else void start();
