import Close from "@expo/material-symbols/close.xml";
import { Icon, IconButton } from "@expo/ui/jetpack-compose";

/** Android `RemoveButton`: a Material icon button. See `remove-button.tsx`. */
export function RemoveButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <IconButton onClick={onPress}>
      <Icon source={Close} size={24} contentDescription={label} />
    </IconButton>
  );
}
