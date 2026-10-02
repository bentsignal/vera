import { Uniwind } from "uniwind";

interface Palette {
  readonly accent: string;
  readonly bubble: string;
}

/**
 * Accent color sets, green (the default) first. Each has tuned light and
 * dark variants; bubbles stay dark enough for white text (about 3:1).
 */
export const THEMES = [
  {
    dark: { accent: "#30d158", bubble: "#24a845" },
    id: "green",
    light: { accent: "#34c759", bubble: "#24a845" },
    name: "Green",
  },
  {
    dark: { accent: "#2dd4bf", bubble: "#14b8a6" },
    id: "teal",
    light: { accent: "#0d9488", bubble: "#0d9488" },
    name: "Teal",
  },
  {
    dark: { accent: "#0a84ff", bubble: "#0a84ff" },
    id: "blue",
    light: { accent: "#007aff", bubble: "#007aff" },
    name: "Blue",
  },
  {
    dark: { accent: "#7c7cff", bubble: "#5b5bf7" },
    id: "indigo",
    light: { accent: "#4f46e5", bubble: "#4f46e5" },
    name: "Indigo",
  },
  {
    dark: { accent: "#bf5af2", bubble: "#a855f7" },
    id: "purple",
    light: { accent: "#7c3aed", bubble: "#7c3aed" },
    name: "Purple",
  },
  {
    dark: { accent: "#ff375f", bubble: "#e8325a" },
    id: "pink",
    light: { accent: "#db2777", bubble: "#e0337f" },
    name: "Pink",
  },
  {
    dark: { accent: "#ff9f0a", bubble: "#f08700" },
    id: "orange",
    light: { accent: "#ea580c", bubble: "#f26b1d" },
    name: "Orange",
  },
  {
    dark: { accent: "#aeaeb2", bubble: "#48484a" },
    id: "graphite",
    light: { accent: "#3a3a3c", bubble: "#3a3a3c" },
    name: "Graphite",
  },
] as const satisfies readonly {
  dark: Palette;
  id: string;
  light: Palette;
  name: string;
}[];

export type ThemeId = (typeof THEMES)[number]["id"];

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

/** Swaps the accent variables for both color schemes. */
export function applyTheme(id: ThemeId) {
  const theme = THEMES.find((candidate) => candidate.id === id) ?? THEMES[0];
  for (const scheme of ["light", "dark"] as const) {
    const palette = theme[scheme];
    Uniwind.updateCSSVariables(scheme, {
      "--color-accent": palette.accent,
      "--color-bubble-outgoing": palette.bubble,
    });
  }
}
