import { SCREEN_BREAKPOINTS } from "./sizes";

export function getScreenSizeFromWidth(width: number) {
  if (width >= SCREEN_BREAKPOINTS.XXL) return "2xl";
  if (width >= SCREEN_BREAKPOINTS.XL) return "xl";
  if (width >= SCREEN_BREAKPOINTS.LG) return "lg";
  if (width >= SCREEN_BREAKPOINTS.MD) return "md";
  if (width >= SCREEN_BREAKPOINTS.SM) return "sm";
  return "base";
}
