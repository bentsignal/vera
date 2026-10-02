import { FieldGroup, Picker, Row, Spacer, Text } from "@expo/ui";

import type {
  PressExperiment,
  ReactionsExperiment,
} from "~/features/preferences/store";
import { setPreference, usePreference } from "~/features/preferences/store";

/**
 * Temporary: lets Shawn compare reaction designs on a device. Remove this
 * section (and the two preferences) once a design is chosen.
 */
export function ExperimentsSection() {
  const press = usePreference("pressExperiment");
  const reactions = usePreference("reactionsExperiment");
  return (
    <FieldGroup.Section>
      <FieldGroup.SectionHeader>
        <Text>Experiments (Temporary)</Text>
      </FieldGroup.SectionHeader>
      <Row alignment="center">
        <Text>Long Press</Text>
        <Spacer />
        <Picker
          selectedValue={press}
          onValueChange={(value: PressExperiment) =>
            setPreference("pressExperiment", value)
          }
        >
          <Picker.Item label="System Menu" value="menu" />
          <Picker.Item label="Glass Overlay" value="glass" />
        </Picker>
      </Row>
      <Row alignment="center">
        <Text>Reactions</Text>
        <Spacer />
        <Picker
          selectedValue={reactions}
          onValueChange={(value: ReactionsExperiment) =>
            setPreference("reactionsExperiment", value)
          }
        >
          <Picker.Item label="Corner Badge" value="badge" />
          <Picker.Item label="Edge Pill" value="pill" />
          <Picker.Item label="Chips" value="chips" />
        </Picker>
      </Row>
      <FieldGroup.SectionFooter>
        <Text>
          Try each design in a conversation. This section goes away once one is
          picked.
        </Text>
      </FieldGroup.SectionFooter>
    </FieldGroup.Section>
  );
}
