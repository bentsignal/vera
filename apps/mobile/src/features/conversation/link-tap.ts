import { ofLatestTouch } from "./row-touch";

/**
 * When a link in a message's text last took a tap (one tap lands at a
 * time), which then isn't the message's.
 */
let linkTappedAt = Number.NEGATIVE_INFINITY;

/**
 * Tells the message around it that a link took the tap, so the tap
 * doesn't also open the message's thread.
 */
export function linkTapped() {
  linkTappedAt = Date.now();
}

/**
 * Whether a link took the tap the message is seeing: one since that touch
 * began, however long what the link opened kept the message waiting.
 */
export function wasLinkTap() {
  return ofLatestTouch(linkTappedAt);
}
