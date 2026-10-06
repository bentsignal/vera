import { useState } from "react";
import { Switch } from "@expo/ui";

/**
 * A switch for a server setting: it shows the choice right away and keeps
 * showing it until the server's value changes, then follows the server
 * again, so a change made elsewhere (a swipe in the Inbox, another device)
 * shows here too. A failed save goes back to the server's value.
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
  // The choice, and the server's value when it was made.
  const [pending, setPending] = useState<{
    choice: boolean;
    from: boolean;
  } | null>(null);
  // The server has moved since the tap: it has the say again.
  if (pending !== null && value !== pending.from) setPending(null);
  const shown = pending === null ? value : pending.choice;
  return (
    <Switch
      label={label}
      value={shown}
      onValueChange={(next) => {
        setPending({ choice: next, from: value });
        onChange(next).catch(() => setPending(null));
      }}
    />
  );
}
