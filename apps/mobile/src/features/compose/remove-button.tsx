import { Button } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  foregroundStyle,
  labelStyle,
} from "@expo/ui/swift-ui/modifiers";

/**
 * A row's trailing remove control: iOS's red minus circle, as a borderless
 * button so only the circle takes the tap, not the whole row.
 * `remove-button.android.tsx` uses a Material icon button.
 */
export function RemoveButton({
  label,
  onPress,
}: {
  /** What VoiceOver reads, such as "Remove Maya". */
  label: string;
  onPress: () => void;
}) {
  return (
    <Button
      label={label}
      systemImage="minus.circle.fill"
      modifiers={[
        buttonStyle("borderless"),
        labelStyle("iconOnly"),
        foregroundStyle("red"),
      ]}
      onPress={onPress}
    />
  );
}
