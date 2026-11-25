import type { Space } from "@decentralized-convex/messages";
import { Alert } from "react-native";

import { showActionSheet } from "~/components/action-sheet";
import { useProfiles } from "~/features/messaging/profiles";
import { useSpaceActions } from "~/features/messaging/spaces";

/**
 * What tapping a member of `space` does: owners choose between their
 * profile and removing them (other owners can't be removed); everyone
 * else opens the profile.
 */
export function useMemberPress(
  space: Space,
  openProfile: (accountId: string) => void,
) {
  const { removeMember } = useSpaceActions();
  const profileOf = useProfiles(
    space.members.map((member) => member.accountId),
  );

  function confirmRemove(accountId: string) {
    const name = profileOf(accountId).displayName;
    Alert.alert(`Remove ${name} from ${space.name}?`, undefined, [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () =>
          void removeMember
            .mutateAsync({ accountId, spaceId: space.spaceId })
            .catch(() =>
              Alert.alert(
                "Couldn't Remove Member",
                "Check your connection and try again.",
              ),
            ),
        style: "destructive",
        text: "Remove",
      },
    ]);
  }

  function onMemberPress(member: Space["members"][number]) {
    if (space.role !== "owner" || member.role === "owner") {
      openProfile(member.accountId);
      return;
    }
    showActionSheet(
      [
        { label: "View Profile", onPress: () => openProfile(member.accountId) },
        {
          destructive: true,
          label: "Remove from Space",
          onPress: () => confirmRemove(member.accountId),
        },
      ],
      profileOf(member.accountId).displayName,
    );
  }

  return onMemberPress;
}
