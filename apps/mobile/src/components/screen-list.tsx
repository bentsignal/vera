import type { LegendListProps } from "@legendapp/list/react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { LegendList } from "@legendapp/list/react-native";
import { useCSSVariable } from "uniwind";

/**
 * A full-screen Legend List under a native header, so large titles collapse
 * as it scrolls and its background follows the theme. It shows nothing
 * until `ready`, then fades in: loading content never pops in.
 */
export function ScreenList<Item>({
  ready = true,
  ...props
}: LegendListProps<Item> & { ready?: boolean }) {
  const background = useCSSVariable("--color-background");
  if (!ready) return null;
  return (
    <Animated.View entering={FadeIn.duration(260)} style={{ flex: 1 }}>
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
    </Animated.View>
  );
}
