import { FieldGroup } from "@expo/ui";

import { ListItem } from "~/components/list-item";
import { RemoveButton } from "~/features/compose/remove-button";

/** Android `KeywordsSection`: a remove button on each row. */
export function KeywordsSection({
  keywords,
  onRemove,
}: {
  keywords: readonly string[];
  onRemove: (removed: readonly string[]) => void;
}) {
  if (keywords.length === 0) return null;
  return (
    <FieldGroup.Section>
      {keywords.map((keyword) => (
        <ListItem
          key={keyword}
          trailing={
            <RemoveButton
              label={`Remove ${keyword}`}
              onPress={() => onRemove([keyword])}
            />
          }
        >
          {keyword}
        </ListItem>
      ))}
    </FieldGroup.Section>
  );
}
