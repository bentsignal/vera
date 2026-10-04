import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuItem,
  Text,
  TextButton,
} from "@expo/ui/jetpack-compose";

import type { Choice } from "./choice-menu";

export type { Choice } from "./choice-menu";

/** Android `ChoiceMenu`: the current value as a text button with a dropdown. */
export function ChoiceMenu<T extends string>({
  value,
  choices,
  onChange,
}: {
  value: T;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const current = choices.find((choice) => choice.value === value);
  return (
    <DropdownMenu
      expanded={expanded}
      onDismissRequest={() => setExpanded(false)}
    >
      <DropdownMenu.Trigger>
        <TextButton onClick={() => setExpanded(true)}>
          <Text>{`${current?.label ?? value} ▾`}</Text>
        </TextButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Items>
        {choices.map((choice) => (
          <DropdownMenuItem
            key={choice.value}
            onClick={() => {
              setExpanded(false);
              onChange(choice.value);
            }}
          >
            <DropdownMenuItem.Text>
              <Text>{choice.label}</Text>
            </DropdownMenuItem.Text>
          </DropdownMenuItem>
        ))}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
