import type { ReactNode } from "react";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useRouter } from "expo-router";

import { showActionSheet } from "~/components/action-sheet";
import { ProminentButton } from "~/components/prominent-button";
import { AccountScope, useAccounts } from "~/features/messaging/account";
import {
  useInviteLinkPreview,
  useSpaceActions,
} from "~/features/messaging/spaces";
import { describeExpiry } from "./invite-links";

type Preview = ReturnType<typeof useInviteLinkPreview>["previews"][number];

/** Keeps the sheet one size while it loads, so it doesn't jump. */
const SHEET_HEIGHT = 420;

function SpaceTile({ name }: { name: string }) {
  return (
    <View
      className="bg-accent size-20 items-center justify-center rounded-3xl"
      style={{ borderCurve: "continuous" }}
    >
      <Text className="text-large-title text-on-accent font-bold">
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      className="items-center gap-2 px-8 pt-10 pb-12"
      style={{ minHeight: SHEET_HEIGHT }}
    >
      {children}
    </Animated.View>
  );
}

/** Joins as one account, or opens the space if it's in it already. */
function JoinCard({
  code,
  preview,
  previews,
  onChoose,
}: {
  code: string;
  preview: Preview;
  /** Every signed-in account the link works for. */
  previews: readonly Preview[];
  onChoose: (account: string) => void;
}) {
  const router = useRouter();
  const showAccount = useAccounts().length > 1;
  const { joinWithLink } = useSpaceActions();

  function open() {
    router.dismiss();
    router.push({
      params: {
        account: preview.account,
        name: preview.name,
        spaceId: preview.spaceId,
      },
      pathname: "/spaces/[spaceId]",
    });
  }

  function join() {
    joinWithLink.mutate(
      { code },
      {
        onError: () =>
          Alert.alert(
            "Couldn't Join Space",
            "The link may have just expired. Try again or ask for a new one.",
          ),
        onSuccess: open,
      },
    );
  }

  return (
    <Card>
      <SpaceTile name={preview.name} />
      <Text className="text-subhead text-muted mt-3 text-center">
        {preview.isMember ? "You're already in" : "You're invited to join"}
      </Text>
      <Text className="text-title text-foreground text-center font-bold">
        {preview.name}
      </Text>
      <Text className="text-subhead text-muted text-center">
        {[
          `${preview.memberCount} ${preview.memberCount === 1 ? "member" : "members"}`,
          ...(preview.isMember ? [] : [describeExpiry(preview.expiresAt)]),
        ].join(" · ")}
      </Text>
      {showAccount && (
        <Pressable
          disabled={previews.length < 2}
          className="mt-1"
          onPress={() =>
            showActionSheet(
              previews.map((choice) => ({
                label: choice.account,
                onPress: () => onChoose(choice.account),
              })),
            )
          }
        >
          <Text className="text-subhead text-accent text-center">
            {`as ${preview.account}`}
          </Text>
        </Pressable>
      )}
      <View className="mt-6 w-full gap-2">
        {preview.isMember ? (
          <ProminentButton label="Open Space" onPress={open} />
        ) : (
          <ProminentButton
            label="Join Space"
            disabled={joinWithLink.isPending}
            onPress={join}
          />
        )}
        <ProminentButton
          label="Not Now"
          variant="text"
          onPress={() => router.dismiss()}
        />
      </View>
    </Card>
  );
}

function InvalidCard() {
  const router = useRouter();
  return (
    <Card>
      <Text className="text-title text-foreground mt-12 text-center font-bold">
        Invite Invalid
      </Text>
      <Text className="text-body text-muted text-center">
        This invite has expired or been turned off. Ask for a new link.
      </Text>
      <View className="mt-6 w-full">
        <ProminentButton label="Close" onPress={() => router.dismiss()} />
      </View>
    </Card>
  );
}

/**
 * What an invite link opens: the space it leads to, and a choice to join
 * it or not.
 */
export function JoinSheet({ code }: { code: string }) {
  const link = useInviteLinkPreview(code);
  const [chosen, setChosen] = useState<string>();
  if (link.isLoading) return <View style={{ height: SHEET_HEIGHT }} />;
  // Prefer an account that isn't in the space yet.
  const preview =
    link.previews.find((found) => found.account === chosen) ??
    link.previews.find((found) => !found.isMember) ??
    link.previews[0];
  if (preview === undefined) return <InvalidCard />;
  return (
    <AccountScope address={preview.account}>
      <JoinCard
        code={code}
        preview={preview}
        previews={link.previews}
        onChoose={setChosen}
      />
    </AccountScope>
  );
}
