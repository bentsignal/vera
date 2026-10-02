import { ActionSheetIOS, Alert, Platform } from "react-native";

export interface SheetAction {
  readonly destructive?: boolean;
  readonly label: string;
  readonly onPress: () => void;
}

/**
 * Shows the platform's native action sheet. Actions run after it closes, so
 * they can present their own screens (such as the photo picker).
 */
export function showActionSheet(actions: readonly SheetAction[]) {
  if (Platform.OS === "ios") {
    const destructiveIndex = actions.findIndex((action) => action.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        cancelButtonIndex: actions.length,
        destructiveButtonIndex:
          destructiveIndex === -1 ? undefined : destructiveIndex,
        options: [...actions.map((action) => action.label), "Cancel"],
      },
      (index) => actions[index]?.onPress(),
    );
    return;
  }
  Alert.alert("", undefined, [
    ...actions.map((action) => ({
      onPress: action.onPress,
      style: action.destructive
        ? ("destructive" as const)
        : ("default" as const),
      text: action.label,
    })),
    { style: "cancel", text: "Cancel" },
  ]);
}
