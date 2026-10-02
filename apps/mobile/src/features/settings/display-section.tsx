import { FieldGroup, Picker, Row, Spacer, Text } from "@expo/ui";

import type { Appearance, MessageLayout } from "~/features/preferences/store";
import type { ThemeId } from "~/features/preferences/themes";
import { useAppIcon } from "~/features/preferences/app-icon";
import { setPreference, usePreference } from "~/features/preferences/store";
import { THEMES } from "~/features/preferences/themes";

export function DisplaySection() {
  const appearance = usePreference("appearance");
  const theme = usePreference("theme");
  const layout = usePreference("messageLayout");
  const appIcon = useAppIcon();
  return (
    <FieldGroup.Section title="Display">
      <Row alignment="center">
        <Text>Appearance</Text>
        <Spacer />
        <Picker
          selectedValue={appearance}
          onValueChange={(value: Appearance) =>
            setPreference("appearance", value)
          }
        >
          <Picker.Item label="System" value="system" />
          <Picker.Item label="Light" value="light" />
          <Picker.Item label="Dark" value="dark" />
        </Picker>
      </Row>
      <Row alignment="center">
        <Text>Theme</Text>
        <Spacer />
        <Picker
          selectedValue={theme}
          onValueChange={(value: ThemeId) => setPreference("theme", value)}
        >
          {THEMES.map((option) => (
            <Picker.Item
              key={option.id}
              label={option.name}
              value={option.id}
            />
          ))}
        </Picker>
      </Row>
      {appIcon.available && (
        <Row alignment="center">
          <Text>App Icon</Text>
          <Spacer />
          <Picker
            selectedValue={appIcon.icon}
            onValueChange={(value: ThemeId) => void appIcon.setIcon(value)}
          >
            {THEMES.map((option) => (
              <Picker.Item
                key={option.id}
                label={option.name}
                value={option.id}
              />
            ))}
          </Picker>
        </Row>
      )}
      <Row alignment="center">
        <Text>Messages</Text>
        <Spacer />
        <Picker
          selectedValue={layout}
          onValueChange={(value: MessageLayout) =>
            setPreference("messageLayout", value)
          }
        >
          <Picker.Item label="Bubbles" value="bubbles" />
          <Picker.Item label="Stacked" value="stacked" />
        </Picker>
      </Row>
    </FieldGroup.Section>
  );
}
