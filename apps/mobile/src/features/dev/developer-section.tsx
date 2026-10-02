import { useState } from "react";
import { Alert } from "react-native";
import { Button, FieldGroup, Text } from "@expo/ui";

import { useDevTools } from "./dev-tools";

/** Settings section for the dev PDS. Hidden in preview and store builds. */
export function DeveloperSection() {
  const devTools = useDevTools();
  const [seeding, setSeeding] = useState(false);
  if (!devTools.enabled) return null;

  async function seed() {
    setSeeding(true);
    const failed = await devTools.seed().then(
      () => false,
      () => true,
    );
    setSeeding(false);
    Alert.alert(
      failed ? "Seeding Failed" : "Seeded",
      failed
        ? "Check the dev deployment logs."
        : "Bots added DMs, a group, and the Bot Lounge space.",
    );
  }

  return (
    <FieldGroup.Section title="Developer">
      <Button
        label={seeding ? "Seeding…" : "Seed Bot Conversations"}
        variant="text"
        disabled={seeding}
        onPress={() => void seed()}
      />
      <FieldGroup.SectionFooter>
        <Text>Bots reply to messages you send in their conversations.</Text>
      </FieldGroup.SectionFooter>
    </FieldGroup.Section>
  );
}
