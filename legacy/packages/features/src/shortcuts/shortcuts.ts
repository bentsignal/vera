import type { Shortcut } from "./types/shortcut-types";

export const shortcuts = {
  "new-chat": {
    name: "New Chat",
    hotkey: {
      key: "/",
      ctrlCmd: true,
    },
  },
  search: {
    name: "Search",
    hotkey: {
      key: ".",
      ctrlCmd: true,
      shift: true,
    },
  },
  "focus-input": {
    name: "Focus Prompt",
    hotkey: {
      key: ".",
      ctrlCmd: true,
    },
  },
  library: {
    name: "Library",
    hotkey: {
      key: "L",
      shift: true,
      ctrlCmd: true,
    },
  },
} as const satisfies Record<string, Shortcut>;
