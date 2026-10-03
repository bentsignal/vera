import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Platform, View } from "react-native";
import { GlassView } from "expo-glass-effect";
import { withUniwind } from "uniwind";

import { cn } from "~/lib/cn";

const StyledGlassView = withUniwind(GlassView);

/**
 * Liquid Glass on iOS. Android has no glass (`GlassView` is a plain view
 * there), so the same surface gets a Material tonal fill instead of
 * nothing: `bg-fill` unless `androidClassName` says otherwise.
 */
export function GlassSurface({
  className,
  androidClassName,
  style,
  isInteractive,
  tintColorClassName,
  children,
}: {
  className?: string;
  androidClassName?: string;
  style?: StyleProp<ViewStyle>;
  isInteractive?: boolean;
  /** iOS only: tints the glass, as for a selected reaction. */
  tintColorClassName?: string;
  children?: ReactNode;
}) {
  if (Platform.OS === "ios") {
    return (
      <StyledGlassView
        isInteractive={isInteractive}
        tintColorClassName={tintColorClassName}
        className={className}
        style={style}
      >
        {children}
      </StyledGlassView>
    );
  }
  return (
    <View
      className={cn(className, androidClassName ?? "bg-fill")}
      style={style}
    >
      {children}
    </View>
  );
}
