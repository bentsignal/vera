import { FieldGroup, Text } from "@expo/ui";
import { List } from "@expo/ui/swift-ui";
import { moveDisabled } from "@expo/ui/swift-ui/modifiers";

/**
 * Your keywords, each removed with its delete control or a swipe, as iOS
 * lists do (see `KEYWORDS_LIST_MODIFIERS`). `keywords-section.android.tsx`
 * gives each row a remove button instead.
 */
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
      <List.ForEach
        onDelete={(indices) =>
          onRemove(indices.flatMap((index) => keywords[index] ?? []))
        }
      >
        {keywords.map((keyword) => (
          // `List.ForEach` always lets rows move; order doesn't matter here.
          <Text key={keyword} modifiers={[moveDisabled()]}>
            {keyword}
          </Text>
        ))}
      </List.ForEach>
    </FieldGroup.Section>
  );
}
