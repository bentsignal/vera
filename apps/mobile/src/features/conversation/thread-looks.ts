import type { Row } from "../native-list/contract.ts";
import type { LookContext, Parts } from "./thread-look-parts.ts";
import {
  customRow,
  daySubheads,
  divider,
  foldFirstDay,
  merged,
  partsOf,
  postWhen,
  repliers,
  repliesLabel,
  untimed,
  whenLabel,
  withoutDays,
} from "./thread-look-parts.ts";

export type { LookContext, LookRowProps } from "./thread-look-parts.ts";

// Development only, while Shawn picks one: ten ways to present a thread
// around its original message. Each takes the thread's rows as the list
// builds them (`nativeRows`, newest first) and changes only what's between
// and around the messages: headers, dividers, and rows drawn by React
// (`custom`, on binaries with `customRows`). The messages themselves look
// as they always do. See thread-look-rows.tsx for the React rows.

export const THREAD_LOOKS = [
  { id: "current", name: "Current" },
  { id: "merged", name: "Merged Divider" },
  { id: "quiet", name: "No Day Dividers" },
  { id: "centered", name: "Centered" },
  { id: "title", name: "Title" },
  { id: "post", name: "Post" },
  { id: "section", name: "Section" },
  { id: "comments", name: "Comments" },
  { id: "sticky", name: "Sticky Original" },
  { id: "summary", name: "Count in Header" },
  { id: "origin", name: "Origin" },
] as const;

export type ThreadLook = (typeof THREAD_LOOKS)[number]["id"];

type Look = (parts: Parts, context: LookContext) => Row[];

/** A row above the original, and the merged divider under it. */
function above(row: (parts: Parts, context: LookContext) => Row) {
  return (parts: Parts, context: LookContext) => [
    row(parts, context),
    ...merged({ ...parts, root: untimed(parts.root) }, context, "replies"),
  ];
}

/** The looks drawn partly by React (thread-look-rows.tsx). */
const CUSTOM_LOOKS = {
  comments: (parts, { now, replyCount }) => {
    const replies = withoutDays(parts.replies, now);
    return [
      parts.root,
      customRow(
        "look-comments",
        {
          component: "lookComments",
          people: repliers(replies),
          replies: replyCount,
        },
        repliesLabel(replyCount),
      ),
      ...replies,
    ];
  },
  origin: above(({ root }, { now, title }) =>
    customRow(
      "look-origin",
      {
        component: "lookOrigin",
        when: whenLabel(root.sentAt, now),
        where: title,
      },
      title,
    ),
  ),
  post: (parts, { now, replyCount }) => {
    const replies = withoutDays(parts.replies, now);
    return [
      untimed(parts.root),
      customRow(
        "look-post",
        {
          component: "lookPost",
          people: repliers(replies).length,
          replies: replyCount,
          when: postWhen(parts.root.sentAt),
        },
        repliesLabel(replyCount),
      ),
      ...replies,
    ];
  },
  section: (parts, { now, replyCount }) => {
    const { day, replies } = foldFirstDay(parts, now);
    const label = repliesLabel(replyCount);
    return [
      parts.root,
      customRow(
        "look-section",
        { component: "lookSection", day, label },
        label,
      ),
      ...daySubheads(replies),
    ];
  },
  title: above(({ root }, { now, title }) =>
    customRow(
      "look-title",
      {
        author: root.author,
        component: "lookTitle",
        when: whenLabel(root.sentAt, now),
        where: title,
      },
      title,
    ),
  ),
} satisfies Partial<Record<ThreadLook, Look>>;

const LOOKS = {
  ...CUSTOM_LOOKS,
  centered: (parts, context) => merged(parts, context, "day"),
  current: (parts) => [
    parts.root,
    ...(parts.divider === undefined ? [] : [parts.divider]),
    ...parts.replies,
  ],
  merged: (parts, context) => merged(parts, context, "replies"),
  quiet: (parts, context) => [
    parts.root,
    ...divider(parts, repliesLabel(context.replyCount), "replies"),
    ...withoutDays(parts.replies, context.now),
  ],
  // Its own bar pins the original (`StickyOriginal`).
  sticky: (parts, context) => merged(parts, context, "replies"),
  // The count is in the header; a bare rule sets the replies apart.
  summary: (parts, context) => [
    parts.root,
    ...divider(parts, "", "replies"),
    ...withoutDays(parts.replies, context.now),
  ],
} satisfies Record<ThreadLook, Look>;

function isCustomLook(look: ThreadLook): look is keyof typeof CUSTOM_LOOKS {
  return look in CUSTOM_LOOKS;
}

/**
 * A thread's rows (newest first, as `nativeRows` makes them) in a look.
 * The original's own day header goes in every look but `current`: its
 * time already says when it was sent.
 */
export function lookRows(
  look: ThreadLook,
  rows: readonly Row[],
  context: LookContext,
) {
  if (look === "current") return rows;
  const parts = partsOf(rows, context.rootId);
  if (parts === null) return rows;
  // Binaries that can't draw React rows get the plainest fix.
  const shown = isCustomLook(look) && !context.customRows ? "merged" : look;
  return LOOKS[shown](parts, context).reverse();
}
