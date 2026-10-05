import { FieldGroup } from "@expo/ui";
import {
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text,
} from "@expo/ui/jetpack-compose";

import { plainRow } from "~/lib/ui-modifiers";

/**
 * A segmented control at the top of a `FieldGroup`, for switching what the
 * form below it shows. `segmented-section.tsx` is the SwiftUI version.
 */
export function SegmentedSection<T extends string>({
  values,
  value,
  onChange,
}: {
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <FieldGroup.Section>
      <SingleChoiceSegmentedButtonRow modifiers={plainRow}>
        {values.map((item) => (
          <SegmentedButton
            key={item}
            selected={item === value}
            onClick={() => onChange(item)}
          >
            <SegmentedButton.Label>
              <Text>{item}</Text>
            </SegmentedButton.Label>
          </SegmentedButton>
        ))}
      </SingleChoiceSegmentedButtonRow>
    </FieldGroup.Section>
  );
}
