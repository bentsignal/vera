export const themes = [
  "sunrise",
  "afternoon",
  "nebula",
  "high-altitude",
  "outer-space",
] as const;

export type Theme = (typeof themes)[number];

export const defaultTheme = "nebula";

export function getThemeClass(theme: Theme) {
  return `theme-${theme}`;
}

export function isTheme(value: string): value is Theme {
  return themes.some((t) => t === value);
}
