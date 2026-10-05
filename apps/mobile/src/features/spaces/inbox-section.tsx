import type { Space } from "@decentralized-convex/messages";
import { useMutation } from "@tanstack/react-query";
import { pdsMutation } from "@decentralized-convex/tanstack-query";
import { FieldGroup, Text } from "@expo/ui";
import { pds } from "@vera/backend/pds";

import { OptimisticSwitch } from "~/components/optimistic-switch";
import { useAccount } from "~/features/messaging/account";

/** Which of the space's channels show in your Inbox, one switch each. */
export function InboxSection({ space }: { space: Space }) {
  const { address } = useAccount();
  const setShowInInbox = useMutation(
    pdsMutation({ mutation: pds.messages.setShowInInbox, session: address }),
  );
  return (
    <FieldGroup.Section title="Show in Inbox">
      {space.channels.map((channel) => (
        <OptimisticSwitch
          key={channel.conversationId}
          label={`#${channel.name}`}
          value={channel.showInInbox !== false}
          onChange={(show) =>
            setShowInInbox.mutateAsync({
              conversationId: channel.conversationId,
              show,
            })
          }
        />
      ))}
      <FieldGroup.SectionFooter>
        <Text>Channels that are off still appear here in the space.</Text>
      </FieldGroup.SectionFooter>
    </FieldGroup.Section>
  );
}
