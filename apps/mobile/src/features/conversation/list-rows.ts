import { useState } from "react";

import type { MessageRow } from "./build-rows";
import type { RowsProps } from "./message-list";
import { arrivedAfter } from "./build-rows";
import { usePlacement } from "./list-position";
import { newestOf } from "./typing-change";
import { useTypingRow } from "./typing-indicator";
import { withTyping } from "./typing-row";

/**
 * The list's rows, newest first: who's typing, then the messages (see
 * `useTypingRow`), whether a row came in while it's open, and its placing
 * on the message it opens on.
 */
export function useListRows({
  rows,
  typists,
  layout,
  anchorId,
  ...pages
}: Pick<
  RowsProps,
  | "anchorId"
  | "layout"
  | "listRef"
  | "onLoadNewer"
  | "onLoadOlder"
  | "onReady"
  | "typists"
> & {
  rows: readonly MessageRow[];
  /** Puts the list at the newest message, then calls back (see `useLatest`). */
  toLatest: (done: () => void) => void;
}) {
  const typing = useTypingRow({
    layout,
    newest: newestOf(rows),
    rows,
    typists,
  });
  // Only messages that arrive while open animate in, not loaded pages.
  const [openedAt] = useState(Date.now);
  const listRows = withTyping(rows);
  const anchorIndex =
    anchorId === undefined
      ? -1
      : listRows.findIndex((row) => row.key === anchorId);
  return {
    anchorIndex,
    listRows,
    placement: usePlacement({ ...pages, anchorIndex }),
    typing: {
      ...typing,
      arriving: (row: MessageRow) => arrivedAfter(row, openedAt),
    },
  };
}
