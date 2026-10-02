import { useState } from "react";
import { Picker, Row, Spacer, Text } from "@expo/ui";
import { Uniwind } from "uniwind";

type Appearance = "system" | "light" | "dark";

export function AppearancePicker() {
  const [appearance, setAppearance] = useState<Appearance>("system");

  function select(value: Appearance) {
    setAppearance(value);
    Uniwind.setTheme(value);
  }

  return (
    <Row alignment="center">
      <Text>Appearance</Text>
      <Spacer />
      <Picker selectedValue={appearance} onValueChange={select}>
        <Picker.Item label="System" value="system" />
        <Picker.Item label="Light" value="light" />
        <Picker.Item label="Dark" value="dark" />
      </Picker>
    </Row>
  );
}
