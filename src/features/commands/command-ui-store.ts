import { create } from "zustand";

interface CommandUiState {
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  recording: boolean;
  showPalette: () => void;
  hidePalette: () => void;
  togglePalette: () => void;
  setShortcutsOpen: (open: boolean) => void;
  setRecording: (recording: boolean) => void;
}

export const useCommandUiStore = create<CommandUiState>((set) => ({
  paletteOpen: false,
  shortcutsOpen: false,
  recording: false,
  showPalette: () => set({ paletteOpen: true }),
  hidePalette: () => set({ paletteOpen: false }),
  togglePalette: () => set((state) => ({ paletteOpen: !state.paletteOpen })),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setRecording: (recording) => set({ recording }),
}));
