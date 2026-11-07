import { cleanup } from "@testing-library/react";
import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, beforeAll } from "vitest";
import { initI18n } from "@/i18n";

beforeAll(async () => {
  await initI18n("es");
});

afterEach(() => {
  cleanup();
  clearMocks();
  document.body.innerHTML = "";
});

Element.prototype.scrollIntoView = () => undefined;
