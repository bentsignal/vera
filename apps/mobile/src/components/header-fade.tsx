import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";

/** Height of the bar holding an inline tab title and its buttons. */
const BAR_HEIGHT = 54;
/** How far below the bar the fade reaches. */
const FADE = 22;

/**
 * Keeps an inline tab title readable over scrolling content: a page-colored
 * band behind the header that fades out below it. Against the page at rest
 * it is invisible; it only shows once content scrolls underneath. Render it
 * after the screen's content so it draws on top (the native header still
 * draws above it).
 */
export function HeaderFade({
  background = "--color-background",
}: {
  /** The CSS color variable of the page behind the content. */
  background?: "--color-background" | "--color-background-grouped";
}) {
  const insets = useSafeAreaInsets();
  const color = useCSSVariable(background);
  if (Platform.OS !== "ios" || typeof color !== "string") return null;
  const solid = insets.top + BAR_HEIGHT;
  const height = solid + FADE;
  // Fade to the same color at zero alpha, so the edge never turns gray.
  const clear = /^#[0-9a-f]{6}$/i.test(color) ? `${color}00` : "transparent";
  return (
    <View
      pointerEvents="none"
      className="absolute top-0 right-0 left-0"
      style={{
        experimental_backgroundImage: `linear-gradient(180deg, ${color} 0%, ${color} ${Math.round((solid / height) * 100)}%, ${clear} 100%)`,
        height,
      }}
    />
  );
}
