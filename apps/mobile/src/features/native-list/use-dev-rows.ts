import { useRef, useState } from "react";

import type { Block, ListEvent, Row } from "./contract";
import type { DevHold } from "./dev-menu-layout";
import { devMessage, devRows, devTyping, PEOPLE } from "./dev-fixtures";
import { nativeSupport } from "./native";

/** Binaries that lift the held message into the menu themselves. */
const canLift = nativeSupport?.features?.includes("lift") === true;

/** How many messages the dev screen loads at most, in pages of 50. */
const MOST = 600;

/**
 * The made-up conversation `/dev-native-list` shows, and what its buttons
 * do to it: arrivals, a reaction, typing, older pages, and layouts.
 */
export function useDevRows() {
  const [layout, setLayout] = useState<"bubbles" | "stacked">("bubbles");
  const [heavy, setHeavy] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => devRows(60, 0, "bubbles"));
  const [arrivals, setArrivals] = useState(0);
  const [typing, setTyping] = useState<0 | 1 | 2>(0);
  const [lifted, setLifted] = useState<string | undefined>();
  // The menu over a held message, and whether the message is lifted into it.
  const [held, setHeld] = useState<DevHold | undefined>();
  const [lifting, setLifting] = useState(false);
  // A thread: a couple of rows, at the top (`alignTop`).
  const [thread, setThread] = useState(false);
  const [last, setLast] = useState("");
  // Opening on a message (a search or notification): a new list each time.
  const [opening, setOpening] = useState({ initialRowId: "", key: 0 });
  // Messages loaded so far, and whether a page is on its way: a ref, so a
  // second request while one loads doesn't load the same page twice.
  const loaded = useRef({ count: 60, loading: false });

  function reset(nextLayout: "bubbles" | "stacked", nextHeavy: boolean) {
    setLayout(nextLayout);
    setHeavy(nextHeavy);
    loaded.current = { count: 60, loading: false };
    setRows(devRows(60, 0, nextLayout, nextHeavy));
  }
  function arrive(count: number) {
    const added = Array.from({ length: count }, (_, index) =>
      devMessage(-(arrivals + index + 1), layout, Date.now(), {
        arrived: true,
        heavy,
      }),
    ).reverse();
    setArrivals(arrivals + count);
    setRows([...added, ...rows]);
  }
  /** The person typing sends their message: it grows out of the bubble. */
  function typed() {
    const message = {
      ...devMessage(-(arrivals + 1), layout, Date.now(), {
        arrived: true,
        author: PEOPLE[0],
      }),
      blocks: [
        { part: "message", spans: [{ text: "On my way!" }], type: "text" },
      ] satisfies Block[],
    };
    setArrivals(arrivals + 1);
    setTyping(0);
    setRows([message, ...rows]);
  }
  function toggleReaction() {
    setRows(withReactionToggled(rows));
  }
  function loadOlder() {
    const { count, loading } = loaded.current;
    if (loading || count >= MOST) return;
    loaded.current = { count, loading: true };
    // A moment later, as from the server.
    setTimeout(() => {
      loaded.current = { count: count + 50, loading: false };
      setRows((now) => [...now, ...devRows(50, count, layout, heavy)]);
    }, 400);
  }
  function onEvent({ nativeEvent }: { nativeEvent: ListEvent }) {
    setLast(JSON.stringify(nativeEvent).slice(0, 160));
    if (nativeEvent.type === "hold" && canLift) {
      // Stacked text has no bubble: it lifts on a card.
      setHeld({
        ...nativeEvent,
        card: layout === "stacked" && nativeEvent.part === "message",
      });
      setLifting(true);
    } else if (nativeEvent.type === "hold") {
      // An older binary: hide the row while the menu would be up.
      setLifted(nativeEvent.rowId);
      setTimeout(() => setLifted(undefined), 1200);
    }
    if (nativeEvent.type === "reachedOlder") loadOlder();
  }

  return {
    arrive,
    held,
    lifting,
    /** The menu starts closing: the message plays back into place. */
    menuClosing: () => setLifting(false),
    menuClosed: () => setHeld(undefined),
    initialRowId: opening.initialRowId || undefined,
    key: opening.key,
    openAt: (id: string) =>
      setOpening({ initialRowId: id, key: opening.key + 1 }),
    heavy,
    last,
    layout,
    lifted,
    nextTyping: () => setTyping(typing === 2 ? 0 : typing === 0 ? 1 : 2),
    onEvent,
    reset,
    rows: thread
      ? threadRows(rows)
      : typing === 0
        ? rows
        : [devTyping(layout, typing), ...rows],
    thread,
    toggleThread: () => setThread(!thread),
    toggleReaction,
    typed,
    typing,
  };
}

/** The newest message with your 👍 added, or taken away. */
function withReactionToggled(rows: Row[]) {
  return rows.map((row, index) => {
    if (index !== 0 || row.kind !== "message") return row;
    const has = row.reactions.some((reaction) => reaction.mine);
    return {
      ...row,
      reactions: has
        ? []
        : [{ content: { emoji: "👍" }, count: 1, key: "👍", mine: true }],
    };
  });
}

/** A reply, its divider, and the original, newest first. */
function threadRows(rows: readonly Row[]) {
  return [
    ...rows.slice(0, 1),
    {
      id: "dev-replies",
      kind: "header",
      label: "1 reply",
      style: "replies",
    } satisfies Row,
    ...rows.slice(1, 2),
  ];
}
