import { useState } from "react";
import { Switch } from "@expo/ui";

/**
 * A switch for a server setting: it shows the choice right away, and the
 * server's value takes over again if `onChange` fails.
 */
export function OptimisticSwitch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => Promise<unknown>;
}) {
  const [choice, setChoice] = useState<boolean | null>(null);
  return (
    <Switch
      label={label}
      value={choice ?? value}
      onValueChange={(next) => {
        setChoice(next);
        onChange(next).catch(() => setChoice(null));
      }}
    />
  );
}
