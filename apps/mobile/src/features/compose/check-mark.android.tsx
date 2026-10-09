import { Checkbox } from "@expo/ui";

/** Android `CheckMark`: a Material checkbox. See `check-mark.tsx`. */
export function CheckMark({
  checked,
  onChange,
}: {
  /** undefined draws nothing, for a row that can't be picked. */
  checked: boolean | undefined;
  onChange: () => void;
}) {
  if (checked === undefined) return null;
  return <Checkbox value={checked} onValueChange={onChange} />;
}
