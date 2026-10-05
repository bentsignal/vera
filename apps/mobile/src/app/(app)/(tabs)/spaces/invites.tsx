import { Stack } from "expo-router";

import { ScreenList } from "~/components/screen-list";
import { AccountScope, useVisibleAccounts } from "~/features/messaging/account";
import { useSpaceInvites } from "~/features/messaging/spaces";
import { InviteRow } from "~/features/spaces/invite-row";

/** Spaces you've been invited to, each to accept or decline. */
export default function InvitesScreen() {
  const { invites, isLoading } = useSpaceInvites();
  const showAccount = useVisibleAccounts().length > 1;
  return (
    <>
      <Stack.Title>Invites</Stack.Title>
      <ScreenList
        ready={!isLoading}
        data={invites}
        keyExtractor={(invite) => invite.key}
        renderItem={({ item }) => (
          <AccountScope address={item.account}>
            <InviteRow
              invite={item}
              isLast={invites.length === 1}
              showAccount={showAccount}
            />
          </AccountScope>
        )}
      />
    </>
  );
}
