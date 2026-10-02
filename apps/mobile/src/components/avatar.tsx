import type { SymbolViewProps } from "expo-symbols";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { withUniwind } from "uniwind";

import { SymbolIcon } from "~/components/symbol-icon";
import { cn } from "~/lib/cn";

const StyledImage = withUniwind(Image);

// iMessage's monogram: white initials on a soft gray gradient.
const MONOGRAM_GRADIENT = "linear-gradient(180deg, #a6abb8, #858994)";

const SIZES = {
  sm: { box: "size-7", text: "text-caption", glyph: 13 },
  row: { box: "size-9", text: "text-footnote", glyph: 16 },
  list: { box: "size-[46px]", text: "text-[19px]", glyph: 20 },
  md: { box: "size-12", text: "text-headline", glyph: 21 },
  header: { box: "size-[52px]", text: "text-[21px]", glyph: 23 },
  lg: { box: "size-20", text: "text-title", glyph: 34 },
  xl: { box: "size-[104px]", text: "text-[42px]", glyph: 44 },
};

/** A symbol standing in for initials, such as `#` for a channel. */
export type AvatarGlyph = SymbolViewProps["name"];

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function Avatar({
  name,
  size = "md",
  uri,
  glyph,
}: {
  name: string;
  size?: keyof typeof SIZES;
  /** Profile photo; it fades in over the initials once loaded. */
  uri?: string | null;
  /** Shown instead of initials when there is no photo. */
  glyph?: AvatarGlyph;
}) {
  const { box, text, glyph: glyphSize } = SIZES[size];
  return (
    <View
      accessibilityLabel={name}
      className={cn("items-center justify-center rounded-full", box)}
      style={{ experimental_backgroundImage: MONOGRAM_GRADIENT }}
    >
      {glyph === undefined ? (
        <Text className={cn("font-semibold text-white", text)}>
          {initials(name)}
        </Text>
      ) : (
        <SymbolIcon
          name={glyph}
          size={glyphSize}
          weight="semibold"
          tintColor="#ffffff"
        />
      )}
      {uri ? (
        <StyledImage
          source={{ uri }}
          contentFit="cover"
          // Fades over the initials instead of popping in.
          transition={180}
          className={cn("absolute rounded-full", box)}
        />
      ) : null}
    </View>
  );
}
