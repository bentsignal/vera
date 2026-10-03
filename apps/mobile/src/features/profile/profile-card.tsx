import { Column, FieldGroup, RNHostView, Text } from "@expo/ui";

import type { AvatarGlyph } from "~/components/avatar";
import { Avatar } from "~/components/avatar";
import { secondaryTextStyle } from "~/lib/colors";
import { plainRow } from "~/lib/ui-modifiers";

/**
 * The top of a profile or conversation details screen, like a contact
 * card: a large photo, the name, a secondary line, and an optional bio,
 * drawn on the page rather than in a card. Render it first inside a
 * `FieldGroup`.
 */
export function ProfileCard({
  name,
  subtitle,
  avatarUrl = null,
  bio = "",
  glyph,
}: {
  name: string;
  subtitle: string;
  avatarUrl?: string | null;
  bio?: string;
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
        {bio.length > 0 && (
          <Text
            style={{ paddingTop: 8 }}
            textStyle={{ fontSize: 17, textAlign: "center" }}
          >
            {bio}
          </Text>
        )}
      </Column>
    </FieldGroup.Section>
  );
}
