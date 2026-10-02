import type { LegendListProps } from "@legendapp/list/react-native";
import { LegendList } from "@legendapp/list/react-native";
import { useCSSVariable } from "uniwind";

/**
 * A full-screen Legend List under a native header, so large titles collapse
 * as it scrolls and its background follows the theme.
 */
export function ScreenList<Item>(props: LegendListProps<Item>) {
  const background = useCSSVariable("--color-background");
  return (
    <LegendList
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      estimatedItemSize={72}
      {...props}
      style={[
        {
          backgroundColor:
            typeof background === "string" ? background : undefined,
          flex: 1,
        },
        props.style,
      ]}
    />
  );
}
