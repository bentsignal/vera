import type { Message } from "@decentralized-convex/messages";
import type { ModelMessage, UserContent } from "ai";

import type { AssistantModel } from "../assistant-models";
import { historyWindow } from "../assistant-history";
import { LIMIT_NOTICE_START } from "../assistant-limits";

// How an assistant's conversation reaches the model (agent.ts): in the
// order it got the messages, with the newest images attached.

/** The newest images the model sees; older ones it only knows were sent. */
const VISIBLE_IMAGES = 4;

/**
 * The person's messages that arrived after the last reply started are
 * moved after that reply, which is when the assistant got them; otherwise
 * they'd look answered already.
 */
export function inAnswerOrder(
  history: readonly Message[],
  self: string,
  answeredThrough: number,
) {
  function unseen(message: Message) {
    return message.authorId !== self && message.sentAt > answeredThrough;
  }
  return [
    ...history.filter((message) => !unseen(message)),
    ...history.filter(unseen),
  ];
}

/** The person's newest images, the ones the model is shown. */
export function visibleImages(history: readonly Message[], self: string) {
  return history
    .filter((message) => message.authorId !== self)
    .flatMap((message) => message.attachments)
    .filter((attachment) => attachment.kind === "image")
    .slice(-VISIBLE_IMAGES);
}

/**
 * How each visible image reaches the model, by its URL: a URL the gateway
 * fetches and its format, or null when it can't be shown
 * (assistantImages.ts `imageUrls`).
 */
export type ShownImages = ReadonlyMap<
  string,
  { mimeType: string; url: string } | null
>;

/** The formats of the images the model is shown, to pick a model that reads them. */
export function visibleImageTypes(
  history: readonly Message[],
  self: string,
  shown: ShownImages,
) {
  return visibleImages(history, self).flatMap((image) => {
    const url = shown.get(image.url);
    return url === undefined || url === null ? [] : [url.mimeType];
  });
}

/**
 * The conversation as the model sees it: the person's messages as user
 * turns, with their newest images attached (those in a format the model
 * reads), and the assistant's own as the `send_message` calls that sent
 * them, so it keeps answering that way.
 */
export function toModelMessages(
  history: readonly Message[],
  self: string,
  model: AssistantModel,
  shown: ShownImages,
) {
  const messages: ModelMessage[] = [];
  let pendingCalls: { body: string; id: string }[] = [];
  function flush() {
    if (pendingCalls.length === 0) return;
    messages.push(
      {
        content: pendingCalls.map(({ body, id }) => ({
          input: { text: body },
          toolCallId: id,
          toolName: "send_message",
          type: "tool-call" as const,
        })),
        role: "assistant",
      },
      {
        content: pendingCalls.map(({ id }) => ({
          output: { type: "text" as const, value: "Sent." },
          toolCallId: id,
          toolName: "send_message",
          type: "tool-result" as const,
        })),
        role: "tool",
      },
    );
    pendingCalls = [];
  }
  const visible = new Set(visibleImages(history, self));
  for (const message of history) {
    if (message.authorId === self && isLimitNotice(message.body)) {
      flush();
      messages.push({
        content: `[Sent automatically, not by you: "${message.body}" That limit has passed now.]`,
        role: "user",
      });
      continue;
    }
    if (message.authorId === self) {
      pendingCalls.push({ body: message.body, id: `m-${message.messageId}` });
      continue;
    }
    flush();
    const lines = [`${sentLabel(message.sentAt)}${message.body}`];
    if (message.quote !== undefined) {
      lines.push(`(replying to: "${message.quote.body.slice(0, 200)}")`);
    }
    const attached: Exclude<UserContent, string> = [];
    for (const attachment of message.attachments) {
      const part = attachmentPart(
        attachment,
        visible.has(attachment) && shownAs(shown, attachment.url),
        model,
      );
      if (typeof part === "string") lines.push(part);
      else attached.push(part);
    }
    const text = lines.filter(Boolean).join("\n");
    messages.push({
      content: [
        { text: text.length > 0 ? text : "(an image)", type: "text" },
        ...attached,
      ],
      role: "user",
    });
  }
  flush();
  return messages;
}

/** How a visible image is shown: by a URL and format, or null when it can't be. */
function shownAs(shown: ShownImages, url: string) {
  return shown.get(url) ?? null;
}

/**
 * An attachment as the model gets it: an image it's shown and can read,
 * by a URL the gateway fetches (`shown`: false when it's too old to be
 * shown, null when it can't be), or a note saying what was sent.
 */
function attachmentPart(
  attachment: Message["attachments"][number],
  shown: { mimeType: string; url: string } | false | null,
  model: AssistantModel,
) {
  if (attachment.kind !== "image") {
    return `[${attachment.kind}: ${attachment.name}]`;
  }
  if (shown === false) return "[an older image, no longer visible]";
  if (shown === null || !model.images.includes(shown.mimeType.toLowerCase())) {
    return "[an image in a format you can't open]";
  }
  return {
    data: new URL(shown.url),
    mediaType: shown.mimeType,
    type: "file" as const,
  };
}

function isLimitNotice(body: string) {
  return body.startsWith(LIMIT_NOTICE_START);
}

/** When an older message was sent, so the model can weigh dates. */
function sentLabel(sentAt: number) {
  if (Date.now() - sentAt < 6 * 60 * 60 * 1000) return "";
  return `[sent ${new Date(sentAt).toUTCString().slice(0, 16)}] `;
}

/**
 * The recent conversation to answer (assistant-history.ts: the messages
 * since `from`, the window's start as of the last reply, from the newest
 * ones in `messages`), with the window's start now; or null when the
 * person hasn't written since the last reply saw their messages (unless
 * `evenIfAnswered`, for a reply the team asked for). Older messages the
 * model can read with a tool.
 */
export function toAnswer(
  messages: readonly Message[],
  self: string,
  {
    answeredThrough,
    evenIfAnswered,
    from,
  }: {
    answeredThrough: number | null;
    evenIfAnswered: boolean;
    from: number | null;
  },
) {
  const window = historyWindow(
    messages.filter((message) => message.deletedAt === undefined),
    from,
  );
  const history =
    answeredThrough === null
      ? window.messages
      : inAnswerOrder(window.messages, self, answeredThrough);
  const newest = history.findLast((message) => message.authorId !== self);
  if (newest === undefined) return null;
  if (!evenIfAnswered && newest.sentAt <= (answeredThrough ?? 0)) return null;
  return { from: window.from, history };
}

/** What the team asked this reply to cover (supportClosures.ts). */
export function teamNote(note: string) {
  return `A note from the Vera team for this reply. They can't see it, so put what matters in your own words:\n\n${note}`;
}
