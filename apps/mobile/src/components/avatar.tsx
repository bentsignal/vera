import { Text, View } from "react-native";
import { Image } from "expo-image";
import { withUniwind } from "uniwind";

import { cn } from "~/lib/cn";

const StyledImage = withUniwind(Image);

// iMessage's monogram: white initials on a soft gray gradient.
const MONOGRAM_GRADIENT = "linear-gradient(180deg, #a6abb8, #858994)";

const SIZES = {
  sm: { box: "size-7", text: "text-caption" },
  row: { box: "size-9", text: "text-footnote" },
  list: { box: "size-[46px]", text: "text-[19px]" },
  md: { box: "size-12", text: "text-headline" },
  lg: { box: "size-20", text: "text-title" },
};

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
}: {
  name: string;
  size?: keyof typeof SIZES;
  /** Profile photo; initials show while it loads or when absent. */
  uri?: string | null;
}) {
  const { box, text } = SIZES[size];
  if (uri) {
    return (
      <StyledImage
        accessibilityLabel={name}
        source={{ uri }}
        contentFit="cover"
        className={cn("rounded-full", box)}
      />
    );
  }
  return (
    <View
      accessibilityLabel={name}
      className={cn("items-center justify-center rounded-full", box)}
      style={{ experimental_backgroundImage: MONOGRAM_GRADIENT }}
    >
      <Text className={cn("font-semibold text-white", text)}>
        {initials(name)}
      </Text>
    </View>
  );
}
