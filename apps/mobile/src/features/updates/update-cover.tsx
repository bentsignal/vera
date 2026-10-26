import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";

import {
  continueWithoutUpdating,
  useLaunchCover,
  useRequiredUpdate,
} from "./app-updates";
import { STORE_LABEL, STORE_URL } from "./store-link";

/**
 * Covers the app while it waits for an update: one a launch is downloading,
 * or one a breaking backend change needs (the old code can't talk to the new
 * backend, so a spinner beats screens that fail). It stays until the app
 * restarts into the update. Only a launch's wait offers to continue without
 * it.
 */
export function UpdateCover() {
  const required = useRequiredUpdate();
  const launch = useLaunchCover();
  if (required === undefined && launch === undefined) return null;
  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
    >
      <View className="bg-background flex-1 items-center justify-center gap-3 px-8">
        {required !== "store" ? (
          <>
            <ActivityIndicator />
            <Text className="text-title3 text-foreground font-semibold">
              Updating Vera…
            </Text>
            {required === undefined && launch === "continue" ? (
              <Pressable
                accessibilityRole="button"
                onPress={continueWithoutUpdating}
              >
                <Text className="text-body text-accent font-semibold">
                  Continue Without Updating
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <Text className="text-title3 text-foreground text-center font-semibold">
              Vera needs an update
            </Text>
            <Text className="text-subhead text-muted text-center">
              This version is too old to update itself. Get the latest one to
              keep going.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void Linking.openURL(STORE_URL)}
            >
              <Text className="text-body text-accent font-semibold">
                {STORE_LABEL}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}
