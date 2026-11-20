import type {
  ActivityItem,
  CompactActivity,
} from "@decentralized-convex/messages";

// Activity as the PDS sends it: each conversation once, its items pointing
// at it (`compact`), or from a PDS before that, a plain list.

export type ActivityResult = ActivityItem[] | CompactActivity;

/**
 * The items, each with its conversation, as the screens show them, from
 * what every PDS answered: compact lists, or from older PDSs, items (the
 * client flattens lists that are all arrays).
 */
export function activityItems(
  found: readonly (ActivityItem | ActivityItem[] | CompactActivity)[],
) {
  return found.flatMap((entry) => {
    if (Array.isArray(entry)) return entry;
    return "items" in entry ? expanded(entry) : [entry];
  });
}

function expanded(result: CompactActivity) {
  const conversations = new Map(
    result.conversations.map((conversation) => [
      conversation.conversationId,
      conversation,
    ]),
  );
  return result.items.flatMap(({ conversationId, ...item }) => {
    const conversation = conversations.get(conversationId);
    return conversation === undefined
      ? []
      : [{ ...item, conversation } satisfies ActivityItem];
  });
}

/** `result` with `update` applied to each item, in whichever form it came. */
export function mapActivity(
  result: ActivityResult,
  update: <Item extends SeenItem>(item: Item) => Item,
) {
  if (!("items" in result)) return result.map(update);
  return { ...result, items: result.items.map(update) };
}

/** What `mapActivity`'s update can read and change of an item. */
interface SeenItem {
  readonly key: string;
  readonly seenAt?: number;
  readonly seenThrough?: number;
}
