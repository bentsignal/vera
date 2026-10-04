import { Picker } from "@expo/ui";

export interface Choice<T extends string> {
  label: string;
  value: T;
}

/**
 * A setting with a few named values, shown at the trailing edge of a row.
 * iOS uses the native menu picker. `choice-menu.android.tsx` uses a text
 * button that opens a dropdown, because Compose's picker is a full-width
 * text field.
 */
export function ChoiceMenu<T extends string>({
  value,
  choices,
  onChange,
}: {
  value: T;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <Picker selectedValue={value} onValueChange={onChange}>
      {choices.map((choice) => (
        <Picker.Item
          key={choice.value}
          label={choice.label}
          value={choice.value}
        />
      ))}
    </Picker>
  );
}
