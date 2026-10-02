import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";

/** Height of the bar holding an inline tab title and its buttons. */
const TAB_BAR_HEIGHT = 54;
/** How far below the bar the fade reaches. */
const TAB_FADE = 22;
/** Alpha along the fade, from where it starts (0) to where it ends (1). */
const FADE_STOPS = [
  [0, 1],
  [0.3, 0.9],
  [0.55, 0.7],
  [0.8, 0.35],
  [1, 0],
] as const;

/**
 * The same color with less alpha, so the fade never turns gray. Colors
 * that aren't `#rrggbb` stay solid until the clear end.
 */
function withAlpha(color: string, alpha: number) {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return `${color}${Math.round(alpha * 255)
      .toString(16)
      .padStart(2, "0")}`;
  }
  return alpha === 0 ? "transparent" : color;
}

/**
 * Keeps an inline tab title readable over scrolling content: a page-colored
 * band behind the header that fades out below it. Against the page at rest
 * it is invisible; it only shows once content scrolls underneath. Render it
 * after the screen's content so it draws on top (the native header still
 * draws above it).
 */
export function HeaderFade({
  background = "--color-background",
  barHeight = TAB_BAR_HEIGHT,
  fade = TAB_FADE,
}: {
  /** The CSS color variable of the page behind the content. */
  background?: "--color-background" | "--color-background-grouped";
  /** Height of the header below the status bar. */
  barHeight?: number;
  /** How far below the bar the fade reaches. */
  fade?: number;
}) {
  const insets = useSafeAreaInsets();
  const color = useCSSVariable(background);
  if (Platform.OS !== "ios" || typeof color !== "string") return null;
  const solid = insets.top + barHeight;
  const height = solid + fade;
  const start = (solid / height) * 100;
  // Eases out of the solid band, so no edge shows where the fade begins.
  const stops = FADE_STOPS.map(
    ([at, alpha]) =>
      `${withAlpha(color, alpha)} ${Math.round(start + (100 - start) * at)}%`,
  );
  return (
    <View
      pointerEvents="none"
      className="absolute top-0 right-0 left-0"
      style={{
        experimental_backgroundImage: `linear-gradient(180deg, ${color} 0%, ${stops.join(", ")})`,
        height,
      }}
    />
  );
}
