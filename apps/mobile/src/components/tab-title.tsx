import { Text } from "react-native";
import { Stack } from "expo-router";
import { useCSSVariable } from "uniwind";

/**
 * A tab's title in the same row as its toolbar buttons, instead of a large
 * title sitting below them. A soft glow in the page color keeps it legible
 * as content scrolls underneath.
 */
export function TabTitle({
  title,
  background = "--color-background",
}: {
  title: string;
  /** The CSS color variable of the page behind the title. */
  background?: "--color-background" | "--color-background-grouped";
}) {
  const glow = useCSSVariable(background);
  return (
    <>
      <Stack.Screen
        // The visible title lives in the toolbar; `title` still names the
        // screen for back buttons and accessibility.
        options={{ headerLargeTitleEnabled: false, headerTitle: "", title }}
      />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.View hidesSharedBackground>
          <Text
            accessibilityRole="header"
            className="text-foreground text-[30px] font-bold"
            style={{
              textShadowColor: typeof glow === "string" ? glow : undefined,
              textShadowOffset: { height: 0, width: 0 },
              textShadowRadius: 10,
            }}
          >
            {title}
          </Text>
        </Stack.Toolbar.View>
      </Stack.Toolbar>
    </>
  );
}
