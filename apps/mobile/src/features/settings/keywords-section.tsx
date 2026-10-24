import { FieldGroup, Text } from "@expo/ui";
import { List } from "@expo/ui/swift-ui";

/**
 * Your keywords, each removed with a swipe, as iOS lists do.
 * `keywords-section.android.tsx` gives each row a remove button instead.
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
          onRemove(keywords.filter((_, index) => indices.includes(index)))
        }
      >
        {keywords.map((keyword) => (
          <Text key={keyword}>{keyword}</Text>
        ))}
      </List.ForEach>
    </FieldGroup.Section>
  );
}
