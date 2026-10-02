import { Text } from "react-native";
import { Stack } from "expo-router";

/**
 * A tab's title in the same row as its toolbar buttons, instead of a large
 * title sitting below them.
 */
export function TabTitle({ title }: { title: string }) {
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
          >
            {title}
          </Text>
        </Stack.Toolbar.View>
      </Stack.Toolbar>
    </>
  );
}
