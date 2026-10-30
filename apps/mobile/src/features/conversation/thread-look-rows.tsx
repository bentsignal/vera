import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Row } from "../native-list/contract";
import type { MessageListProps } from "../native-list/list-props";
import type { LookRowProps } from "./thread-looks";
import { Avatar } from "~/components/avatar";
import { SymbolIcon } from "~/components/symbol-icon";
import { MessageListRow } from "../native-list/native";
import { lookRows } from "./thread-looks";

// Development only: the React rows the thread looks put in the native
// list (thread-looks.ts).

/** Where a stacked message's text starts: padding, photo, and its gap. */
const TEXT_COLUMN = 16 + 36 + 12;

function Hairline() {
  return (
    <View
      className="bg-separator"
      style={{ height: StyleSheet.hairlineWidth }}
    />
  );
}

function TitleRow({
  author,
  when,
  where,
}: Extract<LookRowProps, { component: "lookTitle" }>) {
  return (
    <View className="px-4 pt-2 pb-1">
      <Text className="text-title text-foreground font-bold">Thread</Text>
      <Text className="text-subhead text-muted mt-0.5" numberOfLines={1}>
        {where === "" ? author.name : `${author.name} in ${where}`} · {when}
      </Text>
      <View className="mt-3">
        <Hairline />
      </View>
    </View>
  );
}

function PostRow({
  when,
  replies,
  people,
}: Extract<LookRowProps, { component: "lookPost" }>) {
  return (
    <View className="pt-3">
      <Text
        className="text-subhead text-muted"
        style={{ paddingLeft: TEXT_COLUMN }}
      >
        {when}
      </Text>
      <View className="mt-3 px-4">
        <Hairline />
        <View className="flex-row gap-5 py-3">
          <Text className="text-subhead text-muted">
            <Text className="text-foreground font-semibold">{replies}</Text>{" "}
            {replies === 1 ? "Reply" : "Replies"}
          </Text>
          {people > 0 && (
            <Text className="text-subhead text-muted">
              <Text className="text-foreground font-semibold">{people}</Text>{" "}
              {people === 1 ? "Person" : "People"}
            </Text>
          )}
        </View>
        <Hairline />
      </View>
    </View>
  );
}

function SectionRow({
  label,
  day,
}: Extract<LookRowProps, { component: "lookSection" }>) {
  return (
    <View className="pt-4">
      <View className="bg-fill h-2" />
      <View className="flex-row items-baseline justify-between px-4 pt-4 pb-1">
        <Text className="text-footnote text-muted font-semibold uppercase">
          {label}
        </Text>
        {day !== undefined && (
          <Text className="text-footnote text-muted uppercase">{day}</Text>
        )}
      </View>
    </View>
  );
}

function DayRow({ label }: Extract<LookRowProps, { component: "lookDay" }>) {
  return (
    <View className="px-4 pt-6 pb-1">
      <Text className="text-footnote text-muted font-semibold uppercase">
        {label}
      </Text>
    </View>
  );
}

function CommentsRow({
  replies,
  people,
}: Extract<LookRowProps, { component: "lookComments" }>) {
  const faces = people.slice(0, 4);
  return (
    <View className="px-4 pt-6">
      <Hairline />
      <View className="flex-row items-center justify-between pt-5 pb-1">
        <Text className="text-foreground text-[20px] font-bold">
          Replies <Text className="text-muted font-semibold">{replies}</Text>
        </Text>
        <View className="flex-row">
          {faces.map((person, index) => (
            <View
              key={person.id}
              className="border-background rounded-full border-2"
              style={{ marginLeft: index === 0 ? 0 : -8 }}
            >
              <Avatar name={person.name} uri={person.avatarUrl} size="sm" />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function OriginRow({
  where,
  when,
  onOpenConversation,
}: Extract<LookRowProps, { component: "lookOrigin" }> & {
  onOpenConversation: () => void;
}) {
  return (
    <View className="flex-row px-4 pt-2">
      <Pressable
        accessibilityRole="button"
        className="bg-fill flex-row items-center gap-1 rounded-full py-1.5 pr-2.5 pl-3 active:opacity-70"
        onPress={onOpenConversation}
      >
        <Text className="text-footnote text-foreground font-semibold">
          {where === "" ? "Conversation" : where}
        </Text>
        <Text className="text-footnote text-muted">· {when}</Text>
        <SymbolIcon
          name={{ android: "chevron_right", ios: "chevron.right" }}
          size={11}
          weight="semibold"
          tintColorClassName="accent-muted"
        />
      </Pressable>
    </View>
  );
}

function LookRow({
  props,
  onOpenConversation,
}: {
  props: LookRowProps;
  onOpenConversation: () => void;
}) {
  switch (props.component) {
    case "lookTitle":
      return <TitleRow {...props} />;
    case "lookPost":
      return <PostRow {...props} />;
    case "lookSection":
      return <SectionRow {...props} />;
    case "lookDay":
      return <DayRow {...props} />;
    case "lookComments":
      return <CommentsRow {...props} />;
    case "lookOrigin":
      return <OriginRow {...props} onOpenConversation={onOpenConversation} />;
  }
}

const COMPONENTS = new Set([
  "lookComments",
  "lookDay",
  "lookOrigin",
  "lookPost",
  "lookSection",
  "lookTitle",
]);

/** A look row's props, as `customRow` (thread-look-parts.ts) made them. */
function isLookProps(props: unknown): props is LookRowProps {
  return (
    typeof props === "object" &&
    props !== null &&
    COMPONENTS.has(String(Reflect.get(props, "component")))
  );
}

function lookPropsOf(row: Row) {
  if (row.kind !== "custom" || !isLookProps(row.props)) return null;
  return row.props;
}

type ThreadLookProps = MessageListProps["threadLook"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** The thread as the list shows it: its original a day earlier if asked. */
export function lookThread(
  thread: MessageListProps["thread"],
  threadLook: ThreadLookProps,
) {
  if (thread === undefined || threadLook?.yesterday !== true) return thread;
  const { root } = thread;
  const sentAt = new Date(root.sentAt.getTime() - DAY_MS);
  return { ...thread, root: { ...root, sentAt } };
}

/** A thread's rows (`nativeRows`) in the look that's on. */
export function withThreadLook(
  rows: readonly Row[],
  {
    now,
    thread,
    threadLook,
  }: {
    now: Date;
    thread: MessageListProps["thread"];
    threadLook: ThreadLookProps;
  },
) {
  if (thread === undefined || threadLook === undefined) return rows;
  return lookRows(threadLook.look, rows, {
    customRows: MessageListRow !== null,
    now,
    replyCount: thread.replyCount,
    rootId: thread.root.id,
    title: threadLook.title,
  });
}

/** Each look row's React view, as children of the list. */
export function ThreadLookRows({
  rows,
  threadLook,
}: {
  rows: readonly Row[];
  threadLook: ThreadLookProps;
}) {
  // Narrowed here, so the callback below keeps it.
  const Host = MessageListRow;
  if (Host === null || threadLook === undefined) return null;
  const { onOpenConversation } = threadLook;
  return rows.flatMap((row) => {
    const props = lookPropsOf(row);
    if (props === null) return [];
    return [
      <Host
        key={row.id}
        rowId={row.id}
        style={{ left: 0, position: "absolute", right: 0, top: 0 }}
      >
        <LookRow props={props} onOpenConversation={onOpenConversation} />
      </Host>,
    ];
  });
}
