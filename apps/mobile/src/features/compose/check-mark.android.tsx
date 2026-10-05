import { Checkbox } from "@expo/ui";

/** Android `CheckMark`: a Material checkbox. See `check-mark.tsx`. */
export function CheckMark({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return <Checkbox value={checked} onValueChange={onChange} />;
}
