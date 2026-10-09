import { Icon } from "@expo/ui";
import { useCSSVariable } from "uniwind";

import { nativeColors } from "~/lib/colors";

const CHECKED = "checkmark.circle.fill";
const UNCHECKED = "circle";

/**
 * Whether a person is picked, at the end of their row: iOS's check circle.
 * `check-mark.android.tsx` uses a Material checkbox.
 */
export function CheckMark({
  checked,
}: {
  checked: boolean | undefined;
  onChange: () => void;
}) {
  const accent = useCSSVariable("--color-accent");
  if (checked === undefined) return null;
  return (
    <Icon
      name={checked ? CHECKED : UNCHECKED}
      size={22}
      color={
        checked && typeof accent === "string"
          ? accent
          : nativeColors.secondaryLabel
      }
    />
  );
}
