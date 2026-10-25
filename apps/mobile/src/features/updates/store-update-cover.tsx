import { Linking, Modal, Pressable, Text, View } from "react-native";

import { STORE_LABEL, STORE_URL } from "./store-link";
import { useMustReplaceBinary } from "./watch-outdated-runtimes";

/**
 * Covers the app when it needs a new store build, not an over-the-air
 * update: the backend lists this binary's runtime as outdated (see
 * services/backend/outdated-runtimes.ts), once its replacement is out. The
 * store-build twin of `UpdateCover`; one tap opens TestFlight or Play.
 */
export function StoreUpdateCover() {
  if (!useMustReplaceBinary()) return null;
  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
    >
      <View className="bg-background flex-1 items-center justify-center gap-3 px-8">
        <Text className="text-title3 text-foreground text-center font-semibold">
          Update Vera
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void Linking.openURL(STORE_URL)}
        >
          <Text className="text-body text-accent font-semibold">
            {STORE_LABEL}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}
