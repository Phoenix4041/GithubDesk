import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/app";
import { useSettingsStore } from "@/features/settings/store";
import { initI18n } from "@/i18n";
import "@/styles/index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container not found");
}

const root = createRoot(container);

void initI18n(useSettingsStore.getState().language).then(() => {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
