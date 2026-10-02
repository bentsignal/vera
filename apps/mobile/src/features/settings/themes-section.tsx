import { Platform, useColorScheme, View } from "react-native";
import { Button, FieldGroup, RNHostView, Row, ScrollView } from "@expo/ui";
import { Mask, Rectangle } from "@expo/ui/swift-ui";
import { foregroundStyle } from "@expo/ui/swift-ui/modifiers";

import { SymbolIcon } from "~/components/symbol-icon";
import { setPreference, usePreference } from "~/features/preferences/store";
import { THEMES } from "~/features/preferences/themes";
import { choiceButton, edgeToEdgeRow } from "~/lib/ui-modifiers";

function ColorChoice({
  color,
  name,
  selected,
  onPress,
}: {
  color: string;
  name: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      variant="text"
      onPress={onPress}
      modifiers={choiceButton(`${name} color`, selected)}
    >
      <RNHostView matchContents>
        <View
          className="size-9 items-center justify-center rounded-full border-2"
          style={{ borderColor: selected ? color : "transparent" }}
        >
          <View
            className="size-7 items-center justify-center rounded-full"
            style={{ backgroundColor: color }}
          >
            {selected && (
              <SymbolIcon
                name={{ android: "check", ios: "checkmark" }}
                size={13}
                weight="bold"
                tintColor="#ffffff"
              />
            )}
          </View>
        </View>
      </RNHostView>
    </Button>
  );
}

/** Matches the carousel's edge padding, so the fades never cover a choice at rest. */
const EDGE = 16;

/**
 * Alpha stops for a mask that fades the outer ~1/23 of each side. SwiftUI
 * spaces gradient colors evenly, so the fade width comes from the count.
 */
const EDGE_MASK = [
  "#00000000",
  ...Array.from({ length: 22 }, () => "#000000"),
  "#00000000",
];

/**
 * Fades a carousel out at its edges, where choices scroll out of the card.
 * The fades (about 16pt on a phone) are no wider than the carousel's
 * padding, so at rest they only cover empty space.
 */
function FadedEdges({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== "ios") return children;
  return (
    <Mask>
      {children}
      <Mask.Content>
        <Rectangle
          modifiers={[
            foregroundStyle({
              colors: EDGE_MASK,
              endPoint: { x: 1, y: 0.5 },
              startPoint: { x: 0, y: 0.5 },
              type: "linearGradient",
            }),
          ]}
        />
      </Mask.Content>
    </Mask>
  );
}

/** Accent colors, previewed in the current color scheme. */
export function ThemesSection() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const theme = usePreference("theme");
  return (
    <FieldGroup.Section title="Themes">
      <FadedEdges>
        <ScrollView
          direction="horizontal"
          showsIndicators={false}
          style={{ paddingHorizontal: EDGE }}
          modifiers={edgeToEdgeRow}
        >
          <Row spacing={4}>
            {THEMES.map((option) => (
              <ColorChoice
                key={option.id}
                color={option[scheme].accent}
                name={option.name}
                selected={theme === option.id}
                onPress={() => setPreference("theme", option.id)}
              />
            ))}
          </Row>
        </ScrollView>
      </FadedEdges>
    </FieldGroup.Section>
  );
}
