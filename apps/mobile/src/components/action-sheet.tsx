import { BottomSheet, Button, Column, Text } from "@expo/ui";

import { NativeHost } from "~/components/native-host";
import { fillWidth, largeButton } from "~/lib/ui-modifiers";

export interface SheetAction {
  label: string;
  onPress?: () => void;
}

/** A native bottom sheet listing actions. Every action dismisses it. */
export function ActionSheet({
  isPresented,
  onDismiss,
  actions,
}: {
  isPresented: boolean;
  onDismiss: () => void;
  actions: SheetAction[];
}) {
  return (
    <NativeHost>
      <BottomSheet isPresented={isPresented} onDismiss={onDismiss}>
        <Column spacing={8}>
          {actions.map((action) => (
            <Button
              key={action.label}
              variant="outlined"
              modifiers={largeButton}
              onPress={() => {
                action.onPress?.();
                onDismiss();
              }}
            >
              <Text modifiers={fillWidth}>{action.label}</Text>
            </Button>
          ))}
        </Column>
      </BottomSheet>
    </NativeHost>
  );
}
