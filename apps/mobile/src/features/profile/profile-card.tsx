import { Pressable } from "react-native";
import { Column, FieldGroup, RNHostView, Row, Text } from "@expo/ui";

import type { AvatarGlyph } from "~/components/avatar";
import { Avatar } from "~/components/avatar";
import { secondaryTextStyle } from "~/lib/colors";
import { plainRow } from "~/lib/ui-modifiers";
import { AffiliatedBadge } from "./affiliated-badge";

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
  onPressAffiliated,
}: {
  name: string;
  subtitle: string;
  avatarUrl?: string | null;
  glyph?: AvatarGlyph;
  /** Shows the verified check, which explains itself when tapped. */
  onPressAffiliated?: () => void;
}) {
  return (
    <FieldGroup.Section>
      <Column alignment="center" spacing={4} modifiers={plainRow}>
        <RNHostView matchContents>
          <Avatar name={name} size="xl" uri={avatarUrl} glyph={glyph} />
        </RNHostView>
        <Row alignment="center" spacing={6}>
          <Text
            numberOfLines={2}
            textStyle={{ fontSize: 28, fontWeight: "700", textAlign: "center" }}
          >
            {name}
          </Text>
          {onPressAffiliated !== undefined && (
            <RNHostView matchContents>
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Explains what the check means"
                hitSlop={10}
                onPress={onPressAffiliated}
              >
                <AffiliatedBadge size={22} />
              </Pressable>
            </RNHostView>
          )}
        </Row>
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
