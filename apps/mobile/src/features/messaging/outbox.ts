import type {
  Attachment,
  LinkCard,
  Mention,
  Quote,
} from "@decentralized-convex/messages";
import { useSyncExternalStore } from "react";
import * as Crypto from "expo-crypto";
import { Image } from "expo-image";
import { pds } from "@vera/backend/pds";

import type { StagedFile } from "./attachments";
import type { AccountSession } from "~/features/session/account-session";
import { TooLargeError, uploadStaged } from "./attachments";
import { enqueueSend, sendPatiently } from "./send-limit";
import { setUploadProgress } from "./upload-progress";

// Messages this device sent that the PDS hasn't confirmed yet, with their
// uploads. They live outside React, so leaving the conversation doesn't
// stop an upload, and the message is still there when you come back.

export type UploadState = "failed" | "too-large" | "uploaded" | "uploading";

export interface OutgoingItem {
  readonly id: string;
  readonly file: StagedFile;
  readonly state: UploadState;
  /** Set once uploaded. */
  readonly attachment?: Attachment;
}

export interface OutgoingMessage {
  readonly account: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly body: string;
  readonly items: readonly OutgoingItem[];
  /** Its link cards, with the previews prefetched while it was typed. */
  readonly linkPreviews: LinkCard[] | undefined;
  /** Who it @mentions; undefined when nobody. */
  readonly mentions: Mention[] | undefined;
  readonly sentAt: number;
  /** "sent" once the PDS has it; it stays to keep showing local media. */
  readonly status: "failed" | "sending" | "sent";
  /** A reply's thread, and where it shows (see `OutgoingReply`). */
  readonly reply?: OutgoingReply;
}

/** Where a reply this device is sending goes. */
export interface OutgoingReply {
  /** Its thread: the thread's original. */
  readonly threadId: string;
  /** The message it answers when that's a reply in the thread. */
  readonly answers?: string;
  /** What it quotes of the message it answers, in its card. */
  readonly quote: Quote;
  /**
   * Whether it shows in the conversation too: sent from there, rather
   * than in the thread. The PDS has the last word (an older one shows
   * only a thread's first reply there).
   */
  readonly inChat: boolean;
}

/** A message to send, with its first link cards (`useLinkPrefetch`). */
export interface OutgoingDraft {
  readonly body: string;
  readonly files: readonly StagedFile[];
  readonly linkPreviews: readonly LinkCard[];
  readonly mentions: readonly Mention[];
  /** Set for a reply in a thread. */
  readonly reply?: OutgoingReply;
}

/** How many uploads run at once across every message. */
const UPLOAD_CONCURRENCY = 3;
/** Sent messages kept for their local media, newest first. */
const KEEP_SENT = 50;
/** How long a send may take before it shows as not sent. */
const SEND_TIMEOUT_MS = 20_000;

let outbox = new Array<OutgoingMessage>();
const listeners = new Set<() => void>();
const sessions = new Map<string, AccountSession>();
const running = new Set<string>();
/** Each message's latest send attempt, so an older one's timeout is ignored. */
const attempts = new Map<string, number>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function find(messageId: string) {
  return outbox.find((message) => message.messageId === messageId);
}

function update(
  messageId: string,
  change: (message: OutgoingMessage) => OutgoingMessage | undefined,
) {
  outbox = outbox.flatMap((message) => {
    if (message.messageId !== messageId) return [message];
    const next = change(message);
    return next === undefined ? [] : [next];
  });
  emit();
}

function updateItem(
  messageId: string,
  itemId: string,
  change: Partial<OutgoingItem>,
) {
  update(messageId, (message) => ({
    ...message,
    items: message.items.map((item) =>
      item.id === itemId ? { ...item, ...change } : item,
    ),
  }));
}

function pruneSent() {
  const sent = outbox.filter((message) => message.status === "sent");
  if (sent.length <= KEEP_SENT) return;
  const dropped = new Set(
    sent.slice(0, sent.length - KEEP_SENT).map((message) => message.messageId),
  );
  outbox = outbox.filter((message) => !dropped.has(message.messageId));
  for (const messageId of dropped) {
    sessions.delete(messageId);
    attempts.delete(messageId);
  }
}

/** Whether any message is still sending or failed: a restart loses them. */
export function hasUnsentMessages() {
  return outbox.some((message) => message.status !== "sent");
}

// A small queue, so ten videos don't all fight for the connection.

let active = 0;
const waiting = new Array<() => void>();

function releaseUploadSlot() {
  active -= 1;
  waiting.shift()?.();
}

async function withUploadSlot<T>(work: () => Promise<T>) {
  if (active >= UPLOAD_CONCURRENCY) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active += 1;
  return work().then(
    (value) => {
      releaseUploadSlot();
      return value;
    },
    (error: unknown) => {
      releaseUploadSlot();
      throw error;
    },
  );
}

async function upload(
  session: AccountSession,
  messageId: string,
  item: OutgoingItem,
) {
  setUploadProgress(item.id, 0);
  const attachment = await withUploadSlot(() =>
    uploadStaged(session, item.file, (fraction) =>
      setUploadProgress(item.id, fraction),
    ),
  ).catch((error: unknown) => {
    updateItem(messageId, item.id, {
      state: error instanceof TooLargeError ? "too-large" : "failed",
    });
    return undefined;
  });
  if (attachment === undefined) return;
  updateItem(messageId, item.id, { attachment, state: "uploaded" });
  // Warm the image cache, so switching from this device's copy to the
  // uploaded one never shows a blank frame.
  const preview =
    attachment.kind === "video" ? attachment.thumbnailUrl : attachment.url;
  if (attachment.kind !== "file" && preview !== undefined) {
    void Image.prefetch(preview).catch(() => null);
  }
}

/**
 * Sends a message whose files are all uploaded. A send can hang (a dropped
 * connection the client keeps retrying), so after a while it shows as not
 * sent and can be tried again. Sends are idempotent by message ID, so a
 * late success and a retry agree, and whichever lands marks it sent. A
 * send refused for going over the sender's limit waits its turn, still
 * showing as sending.
 */
async function send(
  session: AccountSession,
  message: OutgoingMessage,
  attachments: Attachment[],
) {
  const { messageId } = message;
  const attempt = (attempts.get(messageId) ?? 0) + 1;
  attempts.set(messageId, attempt);
  const request = pds.messages.send({
    attachments,
    body: message.body,
    conversationId: message.conversationId,
    // Undefined (left out) when empty: older servers don't take it.
    mentions: message.mentions,
    messageId,
    ...replyArgs(message.reply),
  });
  const giveUpAt = Date.now() + SEND_TIMEOUT_MS;
  const sent = enqueueSend(session.address, SEND_TIMEOUT_MS, () =>
    Date.now() >= giveUpAt
      ? Promise.reject(new Error("Timed out waiting to send"))
      : sendPatiently(() => session.pds.mutate(request), giveUpAt),
  ).then(
    (sent) => {
      update(messageId, (current) => ({
        ...current,
        // Where the PDS put it (see `inChat`).
        reply:
          current.reply === undefined
            ? undefined
            : { ...current.reply, inChat: sent.threadOnly !== true },
        status: "sent",
      }));
      return true;
    },
    () => false,
  );
  const settled = await Promise.race([
    sent,
    new Promise<false>((resolve) =>
      setTimeout(() => resolve(false), SEND_TIMEOUT_MS),
    ),
  ]);
  // Only the latest attempt reports a failure.
  if (!settled && attempts.get(messageId) === attempt) {
    update(messageId, (current) =>
      current.status === "sent" ? current : failed(current),
    );
  }
}

/** What `send` takes for a reply: the message it answers, and where it shows. */
function replyArgs(reply: OutgoingReply | undefined) {
  if (reply === undefined) return {};
  return {
    threadId: reply.answers ?? reply.threadId,
    threadOnly: !reply.inChat,
  };
}

/** Uploads whatever hasn't uploaded yet, then sends the message. */
async function deliver(messageId: string) {
  const session = sessions.get(messageId);
  if (session === undefined || running.has(messageId)) return;
  running.add(messageId);
  update(messageId, (message) => ({
    ...message,
    items: message.items.map((item) =>
      item.state === "failed" ? { ...item, state: "uploading" } : item,
    ),
    status: "sending",
  }));
  const toUpload =
    find(messageId)?.items.filter((item) => item.state === "uploading") ?? [];
  await Promise.all(toUpload.map((item) => upload(session, messageId, item)));

  const message = find(messageId);
  const attachments = message?.items.flatMap((item) =>
    item.attachment === undefined ? [] : [item.attachment],
  );
  if (message !== undefined && attachments?.length === message.items.length) {
    await send(session, message, attachments);
  } else if (message !== undefined) {
    update(messageId, failed);
  }
  running.delete(messageId);
}

function failed(message: OutgoingMessage) {
  return { ...message, status: "failed" as const };
}

/**
 * Sends a message, shown in the conversation right away with this
 * device's copies of its attachments while they upload.
 */
export function sendOutgoing(
  session: AccountSession,
  conversationId: string,
  { body, files, linkPreviews, mentions, reply }: OutgoingDraft,
) {
  const messageId = Crypto.randomUUID();
  sessions.set(messageId, session);
  outbox = [
    ...outbox,
    {
      account: session.address,
      body,
      conversationId,
      items: files.map((file) => ({
        file,
        id: file.id,
        state: "uploading" as const,
      })),
      linkPreviews: linkPreviews.length > 0 ? [...linkPreviews] : undefined,
      mentions: mentions.length > 0 ? [...mentions] : undefined,
      messageId,
      reply,
      sentAt: Date.now(),
      status: "sending",
    },
  ];
  pruneSent();
  emit();
  void deliver(messageId);
}

/** Tries a failed message again, re-uploading only what failed. */
export function retryOutgoing(messageId: string) {
  void deliver(messageId);
}

/** Forgets a message that didn't send. */
export function deleteOutgoing(messageId: string) {
  if (running.has(messageId)) return;
  update(messageId, () => undefined);
  sessions.delete(messageId);
  attempts.delete(messageId);
}

/**
 * Takes one attachment out of a message that didn't send, then sends the
 * rest (or forgets the message if nothing is left).
 */
export function removeOutgoingItem(messageId: string, itemId: string) {
  if (running.has(messageId)) return;
  update(messageId, (message) => {
    const items = message.items.filter((item) => item.id !== itemId);
    return items.length === 0 && message.body.length === 0
      ? undefined
      : { ...message, items };
  });
  if (find(messageId) === undefined) {
    sessions.delete(messageId);
    attempts.delete(messageId);
  } else if (
    find(messageId)?.items.every((item) => item.state === "uploaded") === true
  ) {
    void deliver(messageId);
  }
}

/** This account's unconfirmed and recently sent messages in a conversation. */
export function useOutbox(account: string, conversationId: string) {
  const all = useSyncExternalStore(subscribe, () => outbox);
  return all.filter(
    (message) =>
      message.account === account && message.conversationId === conversationId,
  );
}
