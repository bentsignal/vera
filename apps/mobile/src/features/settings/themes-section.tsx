import type { ImageSourcePropType } from "react-native";
import { useColorScheme, View } from "react-native";
import { Image } from "expo-image";
import { Button, FieldGroup, RNHostView, Row, ScrollView } from "@expo/ui";

import { SymbolIcon } from "~/components/symbol-icon";
import { useAppIcon } from "~/features/preferences/app-icon";
import { ICON_PREVIEWS } from "~/features/preferences/icon-previews";
import { setPreference, usePreference } from "~/features/preferences/store";
import { THEMES } from "~/features/preferences/themes";
import { cn } from "~/lib/cn";
import { choiceButton, edgeToEdgeRow } from "~/lib/ui-modifiers";

function IconChoice({
  source,
  name,
  selected,
  onPress,
}: {
  source: ImageSourcePropType;
  name: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      variant="text"
      onPress={onPress}
      modifiers={choiceButton(`${name} app icon`, selected)}
    >
      <RNHostView matchContents>
        <View
          className={cn(
            "size-[70px] items-center justify-center rounded-[19px] border-[2.5px]",
            selected ? "border-accent" : "border-transparent",
          )}
        >
          <Image source={source} style={{ height: 58, width: 58 }} />
        </View>
      </RNHostView>
    </Button>
  );
}

function ColorChoice({
  color,
  name,
  selected,
  onPress,
}: {
  color: string;
  name: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      variant="text"
      onPress={onPress}
      modifiers={choiceButton(`${name} color`, selected)}
    >
      <RNHostView matchContents>
        <View
          className="size-9 items-center justify-center rounded-full border-2"
          style={{ borderColor: selected ? color : "transparent" }}
        >
          <View
            className="size-7 items-center justify-center rounded-full"
            style={{ backgroundColor: color }}
          >
            {selected && (
              <SymbolIcon
                name={{ android: "check", ios: "checkmark" }}
                size={13}
                weight="bold"
                tintColor="#ffffff"
              />
            )}
          </View>
        </View>
      </RNHostView>
    </Button>
  );
}

/**
 * App icons (where the platform can switch them) and accent colors, picked
 * from previews in the current color scheme.
 */
export function ThemesSection() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const theme = usePreference("theme");
  const appIcon = useAppIcon();
  return (
    <FieldGroup.Section title="Themes">
      {appIcon.available && (
        <ScrollView
          direction="horizontal"
          showsIndicators={false}
          style={{ paddingHorizontal: 16 }}
          modifiers={edgeToEdgeRow}
        >
          <Row spacing={4}>
            {THEMES.map((option) => (
              <IconChoice
                key={option.id}
                source={ICON_PREVIEWS[option.id][scheme]}
                name={option.name}
                selected={appIcon.icon === option.id}
                onPress={() => void appIcon.setIcon(option.id)}
              />
            ))}
          </Row>
        </ScrollView>
      )}
      <ScrollView direction="horizontal" showsIndicators={false}>
        <Row spacing={4}>
          {THEMES.map((option) => (
            <ColorChoice
              key={option.id}
              color={option[scheme].accent}
              name={option.name}
              selected={theme === option.id}
              onPress={() => setPreference("theme", option.id)}
            />
          ))}
        </Row>
      </ScrollView>
    </FieldGroup.Section>
  );
}
