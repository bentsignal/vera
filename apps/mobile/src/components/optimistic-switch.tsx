import { useState } from "react";
import { Switch } from "@expo/ui";

/**
 * A switch for a server setting: it shows the choice right away, then the
 * server's value takes over again once `onChange` settles, so a change made
 * elsewhere (a swipe in the Inbox, another device) shows here too.
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
        void onChange(next)
          .catch(() => null)
          .finally(() => setChoice(null));
      }}
    />
  );
}
