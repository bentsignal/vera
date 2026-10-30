import { useRef } from "react";
import { useFocusEffect, useRouter } from "expo-router";

import type { Frame, Lift, ListEvent } from "./native";
import type { ReactionAction } from "./reaction-events";
import type { MenuTarget } from "~/features/conversation/glass-message-menu";
import type {
  ToggleReaction,
  ViewReactions,
} from "~/features/conversation/message-actions";
import type { Message, MessageAttachment } from "~/features/conversation/types";
import type { MessageLayout } from "~/features/preferences/store";
import { groupParam } from "~/features/conversation/media-group";
import { linkCardsOf, visibleBody } from "~/features/conversation/message-text";
import { showNotSent } from "~/features/conversation/not-sent";
import { showUploadProblem } from "~/features/conversation/upload-problem";
import { markPhoto } from "~/features/dev/photo-timing";
import { useOpenProfile } from "~/features/profile/use-open-profile";
import { impact } from "~/lib/native-extras";
import { openLink } from "~/lib/open-link";
import { heldPart, mediaOf } from "./held-part";
import { isJumbo } from "./jumbo";
import { listFocused, pressMedia } from "./media-open";
import { reactionAction, reactionMenuPlace } from "./reaction-events";

type PressEvent = Extract<ListEvent, { type: "press" }>;
type HoldEvent = Extract<ListEvent, { type: "hold" }>;

/** Retries or removes an attachment that didn't upload; true if it was one. */
function handledStuck(attachment: MessageAttachment | undefined) {
  const upload = attachment?.upload;
  if (upload?.state !== "failed" && upload?.state !== "too-large") {
    return false;
  }
  showUploadProblem(upload);
  return true;
}

/** A message's photos and videos as the viewer's group. */
function viewerItems(message: Message) {
  return mediaOf(message).map(({ attachment }) => ({
    height: attachment.height,
    kind: attachment.kind === "video" ? ("video" as const) : ("image" as const),
    poster: attachment.localThumbnailUrl ?? attachment.thumbnailUrl,
    url: attachment.localUrl ?? attachment.url,
    width: attachment.width,
  }));
}

/** The file a tap landed on: by its address, or by its part. */
function fileOf(message: Message, event: PressEvent) {
  const byUrl = message.attachments.find(
    (attachment) =>
      attachment.kind === "file" &&
      event.url !== undefined &&
      (attachment.url === event.url || attachment.localUrl === event.url),
  );
  return byUrl ?? heldPart(message, event).attachment;
}

/** Opens a file, once it's uploaded, or offers to retry one that wasn't. */
function openFile(message: Message, event: PressEvent) {
  const attachment = fileOf(message, event);
  if (attachment === undefined || handledStuck(attachment)) return;
  const { upload } = attachment;
  if (upload === undefined || upload.state === "uploaded") {
    openLink(attachment.url);
  }
}

/** Opens a link card's page (its preview's canonical address). */
function openCard(message: Message, event: PressEvent) {
  const cards = linkCardsOf(message);
  const link = event.url ?? heldPart(message, event).link;
  const card = cards.find((each) => each.link === link);
  const url = card?.preview?.url ?? link;
  if (url !== undefined) openLink(url);
}

/** What the list's taps open, by what they landed on. */
interface PressActions {
  readonly openThread: ((message: Message) => void) | undefined;
  readonly openMedia: (message: Message, index: number) => void;
  readonly openProfile: (address: string) => void;
  readonly toggleReaction: ToggleReaction;
  readonly viewReactions: ViewReactions;
}

function onPress(event: PressEvent, message: Message, actions: PressActions) {
  function thread() {
    // A message still sending (or that failed) has no thread yet.
    if (message.status === undefined) actions.openThread?.(message);
  }
  const handlers = {
    author: () => actions.openProfile(message.authorId),
    file: () => openFile(message, event),
    link: () => event.url !== undefined && openLink(event.url),
    linkCard: () => openCard(message, event),
    media: () => actions.openMedia(message, event.index ?? 0),
    mention: () =>
      event.accountId !== undefined && actions.openProfile(event.accountId),
    message: thread,
    notSent: () => showNotSent(message.id),
    quote: thread,
    // `onReaction` takes one with its `reactionKey`; without, nothing.
    reaction: () => undefined,
    replies: thread,
  } satisfies Record<PressEvent["element"], () => unknown>;
  // A binary that reports something this JavaScript doesn't know: nothing.
  if (Object.hasOwn(handlers, event.element)) handlers[event.element]();
}

/** The part a menu opens over: as a hold reports it. */
interface MenuPlace {
  readonly rowId: string;
  readonly part?: string;
  readonly index?: number;
  readonly frame: Frame;
}

/** How the menu lifts a held part (see `menuTarget`). */
interface MenuOptions {
  readonly layout: MessageLayout;
  readonly self: string;
  /** Lifts the held part into the menu, or (undefined) lands it back. */
  readonly lift: (lift: Lift | undefined) => void | Promise<void>;
}

/**
 * The glass menu over a held part: its actions, or with `mode`
 * "reactions", who reacted to it. The list lifts the message itself
 * (`lift`): the menu draws no copy and says where it goes.
 */
function menuTarget(
  event: MenuPlace,
  message: Message,
  { layout, self, lift }: MenuOptions,
  mode: MenuTarget["mode"],
) {
  const held = heldPart(message, event);
  const text = held.attachment === undefined && held.link === undefined;
  const align =
    layout === "bubbles" && message.authorId === self ? "end" : "start";
  return {
    align,
    attachment: held.attachment,
    link: held.link,
    message,
    mode,
    part: held.part,
    lift: {
      onLand: () => lift(undefined),
      onLift: (place) => {
        void lift({
          index: event.index,
          origin: place.fromMiddle ? "middle" : align,
          part: event.part,
          rowId: event.rowId,
          scale: place.scale,
          shift: place.shift,
        });
      },
    },
    rect: event.frame,
    // Text without a bubble (stacked, jumbo emoji) lifts on a card, as the
    // native list draws it; everything else as it is.
    shape:
      text && (layout === "stacked" || isJumbo(visibleBody(message) ?? ""))
        ? "card"
        : "plain",
  } satisfies MenuTarget;
}

/** Opens a message's photos and videos in the viewer, on `index`. */
function useOpenMedia() {
  const router = useRouter();
  /** Media opened from here is on its way or showing (`pressMedia`). */
  const opening = useRef(false);
  useFocusEffect(() => {
    opening.current = listFocused();
  });
  return (message: Message, index: number) => {
    const item = mediaOf(message)[index];
    if (item === undefined || handledStuck(item.attachment)) return;
    const press = pressMedia(opening.current);
    opening.current = press.opening;
    if (!press.opens) return;
    const { attachment } = item;
    // A video opens playing, in the video player, not on its poster in
    // the group.
    if (attachment.kind === "video") {
      router.push({
        params: { kind: "video", url: attachment.localUrl ?? attachment.url },
        pathname: "/media",
      });
      return;
    }
    // Timing for opening a photo (dev and profile bundles only).
    markPhoto("press", { index, url: attachment.localUrl ?? attachment.url });
    router.push({
      params: { group: groupParam(viewerItems(message)), index: String(index) },
      pathname: "/media",
    });
  };
}

/**
 * A tap or hold on a reaction (see `reactionAction`). A tap's haptic is
 * native's; a hold's is ours, as for any hold.
 */
function onReaction(
  event: HoldEvent | PressEvent,
  message: Message,
  action: ReactionAction,
  {
    actions,
    menu,
    openMenu,
  }: {
    actions: PressActions;
    menu: MenuOptions;
    openMenu: (target: MenuTarget) => void;
  },
) {
  const { emoji, frame, kind, part } = action;
  if (kind === "toggle") {
    actions.toggleReaction(message.id, emoji, part);
    return;
  }
  // A message still sending (or that failed) has no reactions yet, and a
  // deleted one has none.
  if (message.status !== undefined || message.deleted === true) return;
  if (event.type === "hold") impact();
  if (kind === "sheet" || frame === undefined) {
    actions.viewReactions(message.id, part, emoji);
    return;
  }
  const place = reactionMenuPlace(message, part, { ...event, frame });
  openMenu(menuTarget(place, message, menu, "reactions"));
}

/**
 * What the native list's events do: the same actions the React Native
 * list's rows take (threads, profiles, links, reactions, retries, the
 * photo viewer), and a hold opens the glass menu over the held part.
 */
export function useListEvents({
  messageOf,
  openThread,
  toggleReaction,
  viewReactions,
  openMenu,
  menu,
  pages,
  onVisible,
}: {
  /** The rows on screen changed (a thread look pins its original). */
  onVisible?: (rowIds: readonly string[]) => void;
  /** The message a row shows, by the row's ID. */
  messageOf: (rowId: string) => Message | undefined;
  openThread: ((message: Message) => void) | undefined;
  toggleReaction: ToggleReaction;
  /** Who reacted to a part, in the sheet. */
  viewReactions: ViewReactions;
  openMenu: (target: MenuTarget) => void;
  /** How the menu lifts a held part (see `menuTarget`). */
  menu: MenuOptions;
  /** The list's place: pages to load, the newest message, being ready. */
  pages: {
    onLoadOlder: () => void;
    onLoadNewer: () => void;
    onNearLatest: (near: boolean) => void;
    onReady: () => void;
  };
}) {
  const actions = {
    openMedia: useOpenMedia(),
    openProfile: useOpenProfile(),
    openThread,
    toggleReaction,
    viewReactions,
  } satisfies PressActions;

  function onMessage(event: HoldEvent | PressEvent) {
    const message = messageOf(event.rowId);
    if (message === undefined) return;
    const reaction = reactionAction(event, menu.layout);
    if (reaction !== null) {
      onReaction(event, message, reaction, { actions, menu, openMenu });
      return;
    }
    if (event.type === "press") {
      onPress(event, message, actions);
      return;
    }
    // A message still sending (or that failed) has no menu, and a deleted
    // one has none.
    if (message.status !== undefined || message.deleted === true) return;
    impact();
    openMenu(menuTarget(event, message, menu, "actions"));
  }

  return ({ nativeEvent: event }: { nativeEvent: ListEvent }) => {
    switch (event.type) {
      case "reachedOlder":
        pages.onLoadOlder();
        return;
      case "reachedNewer":
        pages.onLoadNewer();
        return;
      case "nearLatest":
        pages.onNearLatest(event.near);
        return;
      case "ready":
        pages.onReady();
        return;
      case "visible":
        // Read marks follow the newest message while it's open
        // (`useMarkRead`).
        onVisible?.(event.rowIds);
        return;
      case "press":
      case "hold":
        onMessage(event);
    }
  };
}
