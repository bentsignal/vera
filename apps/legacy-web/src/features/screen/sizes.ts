export const SCREEN_BREAKPOINTS = {
  SM: 640,
  MD: 768,
  LG: 1024,
  XL: 1280,
  XXL: 1536,
} as const;

export const ScreenSize = {
  BASE: "base",
  SM: "sm",
  MD: "md",
  LG: "lg",
  XL: "xl",
  XXL: "2xl",
} as const;

export type ScreenSizeValue = (typeof ScreenSize)[keyof typeof ScreenSize];

export const SCREEN_ORDER = {
  base: 0,
  sm: 1,
  md: 2,
  lg: 3,
  xl: 4,
  "2xl": 5,
} as const satisfies Record<ScreenSizeValue, number>;
