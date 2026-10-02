import { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { pdsMutation } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { useAccount } from "~/features/messaging/account";
import { useInbox } from "~/features/messaging/conversations";
import { toAddress } from "~/features/messaging/directory";
import { useDisplayNames } from "~/features/messaging/profiles";

/** Recipients for a new DM (one person) or group (several). */
export function useCompose() {
  const router = useRouter();
  const { address: self } = useAccount();
  const { conversations } = useInbox();
  const [query, setQuery] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  // Remounting clears the native field after someone is added.
  const [fieldKey, setFieldKey] = useState(0);
  const known = [
    ...new Set((conversations ?? []).flatMap((item) => item.memberIds)),
  ].filter((address) => address !== self);
  const displayName = useDisplayNames([...known, ...recipients]);
  const openDirect = useMutation(
    pdsMutation({ mutation: pds.messages.openDirect }),
  );
  const createGroup = useMutation(
    pdsMutation({ mutation: pds.messages.createGroup }),
  );

  const typed = toAddress(query);
  const needle = query.trim().toLowerCase();
  const isGroup = recipients.length > 1;

  function add(address: string) {
    setRecipients((current) =>
      current.includes(address) ? current : [...current, address],
    );
    setQuery("");
    setFieldKey((key) => key + 1);
  }

  function remove(address: string) {
    setRecipients((current) => current.filter((item) => item !== address));
  }

  async function start() {
    const [only] = recipients;
    const created = await (
      isGroup || only === undefined
        ? createGroup.mutateAsync({
            members: recipients,
            name: groupName.trim(),
          })
        : openDirect.mutateAsync({ accountId: only })
    ).catch(() => null);
    if (created === null) {
      Alert.alert("Couldn't Start Conversation", "Try again in a moment.");
      return;
    }
    router.dismiss();
    router.push({
      params: { conversationId: created.conversationId },
      pathname: "/conversation/[conversationId]",
    });
  }

  return {
    add,
    canStart:
      recipients.length > 0 &&
      (!isGroup || groupName.trim().length > 0) &&
      !openDirect.isPending &&
      !createGroup.isPending,
    displayName,
    fieldKey,
    isGroup,
    newAddress:
      typed !== null && typed !== self && !recipients.includes(typed)
        ? typed
        : null,
    recipients,
    remove,
    setGroupName,
    setQuery,
    start,
    suggestions: known.filter(
      (address) =>
        !recipients.includes(address) &&
        (address.includes(needle) ||
          displayName(address).toLowerCase().includes(needle)),
    ),
  };
}
