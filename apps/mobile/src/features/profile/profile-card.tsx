import { Column, FieldGroup, RNHostView, Text } from "@expo/ui";

import type { AvatarGlyph } from "~/components/avatar";
import { Avatar } from "~/components/avatar";
import { secondaryTextStyle } from "~/lib/colors";
import { plainRow } from "~/lib/ui-modifiers";

/**
 * The top of a profile or conversation details screen, like a contact
 * card: a large photo, the name, and a secondary line, drawn on the page
 * rather than in a card. Render it first inside a `FieldGroup`.
 */
export function ProfileCard({
  name,
  subtitle,
  avatarUrl = null,
  glyph,
}: {
  name: string;
  subtitle: string;
  avatarUrl?: string | null;
  glyph?: AvatarGlyph;
}) {
  return (
    <FieldGroup.Section>
      <Column alignment="center" spacing={4} modifiers={plainRow}>
        <RNHostView matchContents>
          <Avatar name={name} size="xl" uri={avatarUrl} glyph={glyph} />
        </RNHostView>
        <Text
          numberOfLines={2}
          textStyle={{ fontSize: 28, fontWeight: "700", textAlign: "center" }}
        >
          {name}
        </Text>
        <Text
          numberOfLines={1}
          textStyle={{ ...secondaryTextStyle, textAlign: "center" }}
        >
          {subtitle}
        </Text>
      </Column>
    </FieldGroup.Section>
  );
}
