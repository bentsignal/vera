import { oklchStringToHex } from "@acme/features/lib/color-utils";

const base = 16;

export function rem(px: number) {
  return base * px;
}

const colors = {
  background: "oklch(0.2 0 0)",
  foreground: "oklch(0.95 0 0)",
  card: "oklch(0.25 0 0)",
  cardForeground: "oklch(0.95 0 0)",
  popover: "oklch(0.25 0 0)",
  popoverForeground: "oklch(0.95 0 0)",
  primary: "oklch(0.95 0 0)",
  primaryForeground: "oklch(0.2 0 0)",
  borderInput: "oklch(0.5 0 0)",
  accent: "oklch(0.3 0 0)",
  destructive: "oklch(0.704 0.191 22.216)",
};

export const hexColors = {
  background: oklchStringToHex(colors.background),
  foreground: oklchStringToHex(colors.foreground),
  card: oklchStringToHex(colors.card),
  cardForeground: oklchStringToHex(colors.cardForeground),
  popover: oklchStringToHex(colors.popover),
  popoverForeground: oklchStringToHex(colors.popoverForeground),
  primary: oklchStringToHex(colors.primary),
  primaryForeground: oklchStringToHex(colors.primaryForeground),
  borderInput: oklchStringToHex(colors.borderInput),
  accent: oklchStringToHex(colors.accent),
  destructive: oklchStringToHex(colors.destructive),
};

export const xrStyles = {
  /** 16 * 0.25 = 4 */
  spacingSm: rem(0.25),
  /** 16 * 0.5 = 8 */
  spacingMd: rem(0.5),
  /** 16 * 1.25 = 20 */
  spacingLg: rem(1.25),
  /** 16 * 1.5 = 24 */
  spacingXl: rem(1.5),
  /** 16 * 2 = 32 */
  spacing2xl: rem(2),
  /** 16 * 2.5 = 40 */
  spacing3xl: rem(2.5),

  /** 16 * 0.5 = 8 */
  sizeSm: rem(0.5),
  /** 16 * 1 = 16 */
  sizeMd: rem(1),
  /** 16 * 1.25 = 20 */
  sizeLg: rem(1.25),
  /** 16 * 1.5 = 24 */
  sizeXl: rem(1.5),
  /** 16 * 2 = 32 */
  size2xl: rem(2),
  /** 16 * 2.5 = 40 */
  size3xl: rem(2.5),

  /** 16 * 0.75 = 12 */
  textXs: rem(0.75),
  /** 16 * 0.875 = 14 */
  textSm: rem(0.875),
  /** 16 * 1 = 16 */
  textMd: rem(1),
  /** 16 * 1.125 = 18 */
  textLg: rem(1.125),
  /** 16 * 1.25 = 20 */
  textXl: rem(1.25),
  /** 16 * 1.5 = 24 */
  text2xl: rem(1.5),

  /** 16 * 0.25 = 4 */
  radiusSm: rem(0.25),
  /** 16 * 0.5 = 8 */
  radiusMd: rem(0.5),
  /** 16 * 1.25 = 20 */
  radiusLg: rem(1.25),

  /** 16 * 12 = 192 */
  containerXs: rem(12),
  /** 16 * 16 = 256 */
  containerSm: rem(16),
  /** 16 * 24 = 384 */
  containerMd: rem(24),
  /** 16 * 32 = 512 */
  containerLg: rem(32),
  /** 16 * 40 = 640 */
  containerXl: rem(40),
  /** 16 * 48 = 768 */
  container2xl: rem(48),
};
