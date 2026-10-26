import { Pressable } from "react-native";

import { SymbolIcon } from "~/components/symbol-icon";

/** Android viewer chrome with a fixed 48 dp touch target. */
export function ViewerCloseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      onPress={onPress}
      className="size-12 items-center justify-center rounded-full bg-black/50 active:opacity-60"
    >
      <SymbolIcon
        name={{ android: "close", ios: "xmark" }}
        size={24}
        tintColor="white"
      />
    </Pressable>
  );
}
