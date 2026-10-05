import { Alert, Pressable, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";

import type { AccountSpaceInvite } from "~/features/messaging/spaces";
import { SymbolIcon } from "~/components/symbol-icon";
import { UnreadBadge } from "~/components/unread-badge";
import { useProfile, usernameOf } from "~/features/messaging/profiles";
import { useSpaceActions } from "~/features/messaging/spaces";
import { cn } from "~/lib/cn";

/** Heads the Spaces list while invitations are waiting. */
export function InvitesRow({ count }: { count: number }) {
  return (
    <Link href="/spaces/invites" asChild>
      <Pressable className="active:bg-fill flex-row items-center gap-3 pl-4">
        <View
          className="bg-fill size-12 items-center justify-center rounded-xl"
          style={{ borderCurve: "continuous" }}
        >
          <SymbolIcon
            name={{ android: "mail", ios: "envelope.fill" }}
            size={22}
            tintColorClassName="accent-accent"
          />
        </View>
        <View className="border-b-hairline border-separator flex-1 flex-row items-center gap-2 py-3 pr-4">
          <Text className="text-headline text-foreground flex-1 font-semibold">
            Invites
          </Text>
          <UnreadBadge count={count} />
          <SymbolIcon
            name={{ android: "chevron_right", ios: "chevron.right" }}
            size={14}
            weight="semibold"
            tintColorClassName="accent-subtle"
          />
        </View>
      </Pressable>
    </Link>
  );
}

function PillButton({
  label,
  prominent = false,
  disabled,
  onPress,
}: {
  label: string;
  prominent?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      className={cn(
        "h-9 flex-1 items-center justify-center rounded-full active:opacity-70",
        prominent ? "bg-accent" : "bg-fill",
        disabled && "opacity-50",
      )}
      onPress={onPress}
    >
      <Text
        className={cn(
          "text-subhead font-semibold",
          prominent ? "text-on-accent" : "text-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * One space you're invited to, with Accept and Decline. Accepting opens the
 * space in place of the invites; declining the last one goes back.
 */
export function InviteRow({
  invite,
  isLast,
  showAccount,
}: {
  invite: AccountSpaceInvite;
  /** The only invite left, so answering it empties the page. */
  isLast: boolean;
  /** Names the invited account, when several show. */
  showAccount: boolean;
}) {
  const router = useRouter();
  const inviter = useProfile(invite.invitedBy);
  const { acceptInvite, declineInvite } = useSpaceActions();
  const isPending = acceptInvite.isPending || declineInvite.isPending;
  const { spaceId } = invite;

  function accept() {
    acceptInvite.mutate(
      { spaceId },
      {
        onError: () =>
          Alert.alert("Couldn't Join Space", "Try again in a moment."),
        onSuccess: () =>
          router.replace({
            params: { account: invite.account, name: invite.name, spaceId },
            pathname: "/spaces/[spaceId]",
          }),
      },
    );
  }

  function decline() {
    declineInvite.mutate(
      { spaceId },
      {
        onError: () =>
          Alert.alert("Couldn't Decline Invite", "Try again in a moment."),
        onSuccess: () => {
          if (isLast) router.back();
        },
      },
    );
  }

  return (
    <View className="flex-row gap-3 pl-4">
      <View
        className="bg-accent mt-3 size-12 items-center justify-center rounded-xl"
        style={{ borderCurve: "continuous" }}
      >
        <Text className="text-title text-on-accent font-bold">
          {invite.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View className="border-b-hairline border-separator flex-1 gap-2.5 py-3 pr-4">
        <View className="gap-0.5">
          <Text className="text-headline text-foreground font-semibold">
            {invite.name}
          </Text>
          <Text numberOfLines={2} className="text-subhead text-muted">
            {[
              `${inviter.displayName} invited you`,
              `${invite.memberCount} ${invite.memberCount === 1 ? "member" : "members"}`,
              ...(showAccount ? [usernameOf(invite.account)] : []),
            ].join(" · ")}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <PillButton label="Decline" disabled={isPending} onPress={decline} />
          <PillButton
            label="Accept"
            prominent
            disabled={isPending}
            onPress={accept}
          />
        </View>
      </View>
    </View>
  );
}
