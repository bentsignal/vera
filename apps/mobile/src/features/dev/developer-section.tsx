import { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Button, FieldGroup, Row, Spacer, Text } from "@expo/ui";

import type { ServerDelay } from "./server-delay";
import { ChoiceMenu } from "~/components/choice-menu";
import { useAccount } from "~/features/messaging/account";
import { forgetForNow } from "~/features/saved/saving";
import { fillRow } from "~/lib/ui-modifiers";
import { useDevTools } from "./dev-tools";
import { setServerDelay, useServerDelay } from "./server-delay";

const DELAYS = [
  { label: "Right Away", value: "off" },
  { label: "After 1.5 Seconds", value: "quick" },
  { label: "After 3 Seconds", value: "slow" },
  { label: "After 10 Seconds", value: "stalled" },
  { label: "Never", value: "never" },
] as const satisfies readonly { label: string; value: ServerDelay }[];

/** Development only: picks how long the PDS takes to answer (`server-delay.ts`). */
function ServerAnswersRow() {
  const delay = useServerDelay();
  return (
    <Row alignment="center" modifiers={fillRow}>
      <Text>Server Answers</Text>
      <Spacer flexible />
      <ChoiceMenu<ServerDelay>
        value={delay}
        choices={DELAYS}
        onChange={setServerDelay}
      />
    </Row>
  );
}

/** Account screen section for the dev PDS. Hidden in preview and store builds. */
export function DeveloperSection() {
  const devTools = useDevTools();
  const router = useRouter();
  const { address, session } = useAccount();
  const [seeding, setSeeding] = useState(false);
  if (!devTools.enabled) return null;

  async function seed(full = false) {
    setSeeding(true);
    const failed = await (full ? devTools.seedFull() : devTools.seed()).then(
      () => false,
      () => true,
    );
    setSeeding(false);
    Alert.alert(
      failed ? "Seeding Failed" : "Seeded",
      failed
        ? "Check the dev deployment logs."
        : full
          ? "Bots filled DMs, 8 groups, and the Storage Lab space."
          : "Bots added DMs, a group, and the Bot Lounge space.",
    );
  }

  async function openLongThread() {
    const target = await devTools.longThreadMiddle().catch(() => null);
    if (target?.messageId == null) {
      Alert.alert("Couldn't Open", "Seed bot conversations first.");
      return;
    }
    router.push({
      params: {
        account: address,
        conversationId: target.conversationId,
        messageId: target.messageId,
      },
      pathname: "/conversation/[conversationId]",
    });
  }

  return (
    <FieldGroup.Section title="Developer">
      <Button
        label={seeding ? "Seeding…" : "Seed Bot Conversations"}
        variant="text"
        disabled={seeding}
        onPress={() => void seed()}
      />
      <Button
        label={seeding ? "Seeding…" : "Seed 20 Full Conversations"}
        variant="text"
        disabled={seeding}
        onPress={() => void seed(true)}
      />
      <Button
        label="Open a Long Thread in the Middle"
        variant="text"
        onPress={() => void openLongThread()}
      />
      <ServerAnswersRow />
      <Button
        label="Forget Saved Conversations"
        variant="text"
        onPress={() => {
          forgetForNow(session.storagePrefix);
          Alert.alert(
            "Saved Conversations Forgotten",
            "Nothing more is saved until Vera opens again.",
          );
        }}
      />
      <FieldGroup.SectionFooter>
        <Text>
          Bots reply to messages you send in their conversations. The long
          thread opens 200 messages back, like an old notification, to test
          loading older and newer messages.
        </Text>
      </FieldGroup.SectionFooter>
    </FieldGroup.Section>
  );
}
