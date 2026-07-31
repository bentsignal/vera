export const themes = [
  "sunrise",
  "afternoon",
  "nebula",
  "high-altitude",
  "outer-space",
] as const;

export type Theme = (typeof themes)[number];

export const defaultTheme = "nebula";
