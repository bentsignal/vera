import type { ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Button, ContextMenu, Host, List, RNHostView } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  alignmentGuide,
  buttonStyle,
  frame,
  listRowInsets,
  listRowSeparator,
  listStyle,
  scrollContentBackground,
  scrollDisabled,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useCSSVariable } from "uniwind";

import type { RowAction } from "./row-actions";
import type { ConversationSummary, ThreadSummaryRow } from "./types";
import { useRunAs } from "~/features/messaging/account";
import { usePrefetchConversation } from "~/features/messaging/prefetch";
import { usernameOf } from "~/features/messaging/profiles";
import { ConversationRowContent, INBOX_ROW_HEIGHT } from "./conversation-row";
import {
  afterMenuCloses,
  inboxMenuActions,
  threadMenuActions,
} from "./row-actions";
import { conversationLabel, threadLabel } from "./row-label";
import { conversationHref, threadHref } from "./thread-links";
import { ThreadRowContent } from "./thread-row";

/** Where the text starts (unread gutter, photo, gap): the separator's inset. */
const TEXT_INSET = 24 + 46 + 12;

const GRAY = "#8e8e93";

function colorOf(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function useToneColors() {
  const accent = colorOf(useCSSVariable("--color-accent"));
  const destructive = colorOf(useCSSVariable("--color-destructive"));
  return { accent, destructive, gray: GRAY };
}

function ActionButtons({
  actions,
  colors,
}: {
  actions: readonly RowAction[];
  colors: ReturnType<typeof useToneColors>;
}) {
  return actions.map((action) => (
    <Button
      key={action.key}
      label={action.label}
      systemImage={action.icon.ios}
      role={action.tone === "destructive" ? "destructive" : undefined}
      modifiers={[tint(colors[action.tone] ?? GRAY)]}
      onPress={() => afterMenuCloses(action.onPress)}
    />
  ));
}

/**
 * One native Inbox row: a one-row SwiftUI List, so it gets the system's
 * own press highlight and separator, with `actions` in its long-press
 * menu. `children` is the shared React Native look, hosted inside and
 * ignoring touches so SwiftUI handles taps and presses.
 *
 * The hosted look is hidden from accessibility, and the button reads
 * `label` instead. Left in, React Native views inside the SwiftUI button
 * broke the Inbox's accessibility tree: XCTest couldn't read any of the
 * app while the Inbox was mounted (`kAXErrorIllegalArgument` on the app
 * itself), so simulator taps failed everywhere on it.
 */
function NativeRow({
  actions,
  label,
  onPress,
  onPressIn,
  children,
}: {
  actions: readonly RowAction[];
  /** What VoiceOver reads for the row (see `row-label.ts`). */
  label: string;
  onPress: () => void;
  /** As a finger lands on the row, before it's known to be a tap. */
  onPressIn?: () => void;
  children: ReactNode;
}) {
  const colors = useToneColors();
  return (
    // The SwiftUI button reports only the tap, so the touch is caught here.
    <View onTouchStart={onPressIn}>
      <Host style={{ height: INBOX_ROW_HEIGHT }}>
        <List
          modifiers={[
            listStyle("plain"),
            scrollDisabled(true),
            scrollContentBackground("hidden"),
          ]}
        >
          <ContextMenu
            // The system's own row background and separator, so a press
            // lifts the row into its highlight and the separator blends in.
            modifiers={[
              listRowInsets({ bottom: 0, leading: 0, top: 0, trailing: 0 }),
              listRowSeparator("visible", "bottom"),
            ]}
          >
            <ContextMenu.Items>
              <ActionButtons actions={actions} colors={colors} />
            </ContextMenu.Items>
            <ContextMenu.Trigger>
              <Button
                modifiers={[
                  buttonStyle("plain"),
                  frame({ height: INBOX_ROW_HEIGHT, maxWidth: Infinity }),
                  alignmentGuide("listRowSeparatorLeading", TEXT_INSET),
                  accessibilityLabel(label),
                ]}
                onPress={onPress}
              >
                <RNHostView>
                  {/* A fixed height, not flex: SwiftUI reports the host's
                    size a few frames after a new row mounts, and until
                    then a flexed row is laid out zero tall, with the
                    photo and unread dot centered on its top edge. */}
                  <View
                    pointerEvents="none"
                    accessibilityElementsHidden
                    className="flex-row"
                    style={{ height: INBOX_ROW_HEIGHT }}
                  >
                    {children}
                  </View>
                </RNHostView>
              </Button>
            </ContextMenu.Trigger>
          </ContextMenu>
        </List>
      </Host>
    </View>
  );
}

/**
 * An Inbox row on iOS: a native row (see `NativeRow`) whose long-press
 * menu holds the conversation's actions.
 */
export function InboxRow({
  conversation,
  showAccount,
}: {
  conversation: ConversationSummary;
  showAccount: boolean;
}) {
  const router = useRouter();
  const runAs = useRunAs();
  const prefetch = usePrefetchConversation();
  const { account, id, title } = conversation;

  function open() {
    router.push({
      pathname: "/conversation/[conversationId]",
      params: { account, conversationId: id, title },
    });
  }

  return (
    <NativeRow
      actions={inboxMenuActions(runAs, conversation)}
      label={conversationLabel(
        conversation,
        showAccount ? usernameOf(account) : null,
      )}
      onPress={open}
      onPressIn={() => prefetch(account, id)}
    >
      <ConversationRowContent
        conversation={conversation}
        showAccount={showAccount}
        separator={false}
      />
    </NativeRow>
  );
}

/** A thread's Inbox row on iOS, which opens the thread. */
export function ThreadInboxRow({
  thread,
  showAccount,
}: {
  thread: ThreadSummaryRow;
  showAccount: boolean;
}) {
  const router = useRouter();
  const runAs = useRunAs();
  const actions = threadMenuActions(runAs, thread, () =>
    router.push(conversationHref(thread)),
  );
  return (
    <NativeRow
      actions={actions}
      label={threadLabel(
        thread,
        showAccount ? usernameOf(thread.account) : null,
      )}
      onPress={() => router.push(threadHref(thread))}
    >
      <ThreadRowContent
        thread={thread}
        showAccount={showAccount}
        separator={false}
      />
    </NativeRow>
  );
}
