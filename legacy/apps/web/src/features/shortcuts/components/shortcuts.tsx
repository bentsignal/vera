import { shortcuts } from "@acme/features/shortcuts";

import { InfoCard } from "~/components/info-card";
import { getShortcutString } from "../util/shortcut-util";

export function Shortcuts() {
  return (
    <InfoCard title="Shortcuts">
      <div className="flex flex-col gap-2">
        {Object.values(shortcuts).map((shortcut) => (
          <div key={shortcut.name} className="flex flex-row gap-2">
            <span className="min-w-36 font-bold">{shortcut.name}</span>
            <span className="font-mono">
              {getShortcutString(shortcut.hotkey)}
            </span>
          </div>
        ))}
      </div>
    </InfoCard>
  );
}
