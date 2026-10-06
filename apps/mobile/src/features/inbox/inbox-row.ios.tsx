import { View } from "react-native";
import { useRouter } from "expo-router";
import {
  Button,
  ContextMenu,
  Host,
  List,
  RNHostView,
  SwipeActions,
} from "@expo/ui/swift-ui";
import {
  alignmentGuide,
  buttonStyle,
  frame,
  labelStyle,
  listRowInsets,
  listRowSeparator,
  listStyle,
  scrollContentBackground,
  scrollDisabled,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useCSSVariable } from "uniwind";

import type { RowAction } from "./swipe-actions";
import type { ConversationSummary } from "./types";
import { useRunAs } from "~/features/messaging/account";
import { ConversationRowContent, INBOX_ROW_HEIGHT } from "./conversation-row";
import {
  afterSwipe,
  inboxMenuActions,
  inboxSwipeActions,
} from "./swipe-actions";

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
      // Icons only, as in Messages; the label is for VoiceOver.
      modifiers={[labelStyle("iconOnly"), tint(colors[action.tone] ?? GRAY)]}
      onPress={() => afterSwipe(action.onPress)}
    />
  ));
}

/**
 * An Inbox row on iOS. Each row is a one-row SwiftUI List, so it gets the
 * system's own swipe actions: the Liquid Glass buttons, full swipe, and
 * haptics of Messages and Mail. Swipe right to Pin; swipe left to hide a
 * channel. Long-press opens the native context menu. The row's content is
 * the shared React Native view, hosted inside and ignoring touches so
 * SwiftUI handles taps and swipes.
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
  const colors = useToneColors();
  const { leading, trailing } = inboxSwipeActions(runAs, conversation);
  const { account, id, title } = conversation;

  function open() {
    router.push({
      pathname: "/conversation/[conversationId]",
      params: { account, conversationId: id, title },
    });
  }

  return (
    <Host style={{ height: INBOX_ROW_HEIGHT }}>
      <List
        modifiers={[
          listStyle("plain"),
          scrollDisabled(true),
          scrollContentBackground("hidden"),
        ]}
      >
        <SwipeActions
          // The system's own row background and separator, so a swipe
          // lifts the row into its highlight and the separator blends in.
          modifiers={[
            listRowInsets({ bottom: 0, leading: 0, top: 0, trailing: 0 }),
            listRowSeparator("visible", "bottom"),
          ]}
        >
          <ContextMenu>
            <ContextMenu.Items>
              <ActionButtons
                actions={inboxMenuActions(runAs, conversation)}
                colors={colors}
              />
            </ContextMenu.Items>
            <ContextMenu.Trigger>
              <Button
                modifiers={[
                  buttonStyle("plain"),
                  frame({ height: INBOX_ROW_HEIGHT, maxWidth: Infinity }),
                  alignmentGuide("listRowSeparatorLeading", TEXT_INSET),
                ]}
                onPress={open}
              >
                <RNHostView>
                  <View pointerEvents="none" className="flex-1 flex-row">
                    <ConversationRowContent
                      conversation={conversation}
                      showAccount={showAccount}
                      separator={false}
                    />
                  </View>
                </RNHostView>
              </Button>
            </ContextMenu.Trigger>
          </ContextMenu>
          <SwipeActions.Actions edge="leading">
            <ActionButtons actions={leading} colors={colors} />
          </SwipeActions.Actions>
          {trailing.length > 0 && (
            <SwipeActions.Actions edge="trailing">
              <ActionButtons actions={trailing} colors={colors} />
            </SwipeActions.Actions>
          )}
        </SwipeActions>
      </List>
    </Host>
  );
}
