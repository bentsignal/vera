import { FieldGroup } from "@expo/ui";
import { Picker, Text } from "@expo/ui/swift-ui";
import { listRowInsets, pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";

import { plainRow } from "~/lib/ui-modifiers";

/**
 * A segmented control drawn straight on a `FieldGroup`'s page, for
 * switching what the form below it shows. `segmented-section.android.tsx`
 * is the Compose version.
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
      <Picker
        selection={value}
        onSelectionChange={(selection) => {
          const next = values.find((item) => item === selection);
          if (next !== undefined) onChange(next);
        }}
        modifiers={[
          pickerStyle("segmented"),
          ...plainRow,
          // As wide as the cards below it.
          listRowInsets({ bottom: 0, leading: 0, top: 0, trailing: 0 }),
        ]}
      >
        {values.map((item) => (
          <Text key={item} modifiers={[tag(item)]}>
            {item}
          </Text>
        ))}
      </Picker>
    </FieldGroup.Section>
  );
}
