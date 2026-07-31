import { Switch } from "@acme/ui/switch";

import { InfoCard } from "~/components/info-card";
import { themes } from "~/lib/theme";
import { cn } from "~/lib/utils";
import { useTheme } from "~/providers/theme-provider";

export function Appearance() {
  const { theme, changeTheme, stars, changeStars } = useTheme();
  return (
    <InfoCard title="Appearance">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          {themes.map((value) => {
            return (
              <div
                key={value}
                className={cn(
                  "border-border size-12 cursor-pointer rounded-full select-none",
                  theme === value && "border-primary border-1",
                  `theme-${value}`,
                )}
                onClick={() => {
                  changeTheme(value);
                }}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Stars</span>
          <Switch
            checked={stars}
            onCheckedChange={(checked) => {
              changeStars(checked);
            }}
          />
        </div>
      </div>
    </InfoCard>
  );
}
