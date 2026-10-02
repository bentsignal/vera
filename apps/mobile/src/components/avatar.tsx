import { Text, View } from "react-native";
import { Image } from "expo-image";
import { withUniwind } from "uniwind";

import { cn } from "~/lib/cn";

const StyledImage = withUniwind(Image);

const BACKGROUNDS = [
  "bg-indigo-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-teal-500",
];

const SIZES = {
  sm: { box: "size-7", text: "text-caption" },
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

function backgroundFor(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return BACKGROUNDS[hash % BACKGROUNDS.length];
}

export function Avatar({
  name,
  seed = name,
  size = "md",
  uri,
}: {
  name: string;
  /** Picks the background color; pass the address so it stays stable. */
  seed?: string;
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
      className={cn(
        "items-center justify-center rounded-full",
        box,
        backgroundFor(seed),
      )}
    >
      <Text className={cn("font-semibold text-white", text)}>
        {initials(name)}
      </Text>
    </View>
  );
}
