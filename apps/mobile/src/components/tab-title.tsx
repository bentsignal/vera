import { Stack } from "expo-router";

/**
 * A tab's native large title: it starts big at the top left, scrolls with
 * the content, and hands off to the small centered title in the glass bar
 * once it scrolls past (the tab stack enables large titles).
 */
export function TabTitle({ title }: { title: string }) {
  return (
    <Stack.Screen
      options={{ headerLargeTitleEnabled: true, headerTitle: title, title }}
    />
  );
}
