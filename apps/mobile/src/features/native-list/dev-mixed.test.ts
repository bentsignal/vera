import assert from "node:assert/strict";
import { test } from "node:test";
import { LINES, reactionAttachment } from "@vera/backend/dev-mixed-lines";

import type { Message } from "../conversation/types.ts";
import type { ReactionSummary } from "../messaging/reactions.ts";
import type { MessageRow, Reaction } from "./contract.ts";
import { attachmentPart, reactionPart } from "../messaging/reaction-part.ts";
import { reactionKey } from "./map-blocks.ts";
import {
  at,
  isBlock,
  MAYA,
  ME,
  messageRows,
  rowsOf,
} from "./map-rows.testing.ts";

// The mixed media dev seed (`devMixed:seed`) puts reactions on photos,
// videos, and a file of its messages. Each must show on the piece it's
// meant for, as the app maps parts: the server stores the seed's
// `attachment` as it's sent, and the app reads it back with
// `reactionPart`.

/** The seed's messages as the app has them, with their reactions. */
function seeded() {
  return LINES.map((line, index) => {
    const tally = new Map<string, ReactionSummary>();
    for (const reaction of line.reactions ?? []) {
      const part = reactionPart({
        attachment: reactionAttachment(line.body, reaction.on),
      });
      const key = `${part} ${reaction.emoji}`;
      const found = tally.get(key);
      tally.set(key, {
        accounts: [...(found?.accounts ?? []), `bot${reaction.by}`],
        count: (found?.count ?? 0) + 1,
        emoji: reaction.emoji,
        mine: false,
        part,
      });
    }
    return {
      line,
      message: {
        attachments: [...(line.attachments ?? [])],
        authorId: line.from === 0 ? ME : MAYA,
        // As conversations.ts reads it: no text is no body.
        body: line.body.length > 0 ? line.body : undefined,
        id: `line-${index}`,
        reactions: [...tally.values()],
        sentAt: new Date(Date.UTC(2026, 9, 23, 12, index)),
      } satisfies Message,
    };
  });
}

/**
 * The reactions drawn on the piece a seeded reaction is meant for:
 * attachment `on`, or the message itself, which for a message without
 * text is its first attachment. Each has its part: a photo's or video's
 * on its media item, a file's or the message's text among the row's.
 */
function shownOn(row: MessageRow, message: Message, on: number | undefined) {
  const piece = on ?? (message.body === undefined ? 0 : undefined);
  const attachment =
    piece === undefined ? undefined : message.attachments[piece];
  if (piece === undefined || attachment === undefined) {
    return { part: "message", reactions: row.reactions };
  }
  const part = String(attachmentPart(message, piece));
  if (attachment.kind === "file") return { part, reactions: row.reactions };
  const items = row.blocks.flatMap((block) =>
    isBlock(block, "media") ? block.items : [],
  );
  const item = at(
    items,
    message.attachments.slice(0, piece).filter((each) => each.kind !== "file")
      .length,
  );
  assert.equal(item.part, part);
  return { part, reactions: item.reactions };
}

function keysOf(reactions: readonly Reaction[]) {
  return reactions.map((reaction) => reaction.key);
}

for (const layout of ["bubbles", "stacked"] as const) {
  void test(`every seeded reaction shows on its own piece (${layout})`, () => {
    const messages = seeded();
    const rows = messageRows(
      rowsOf(
        messages.map(({ message }) => message),
        { layout },
      ),
    );
    let checked = 0;
    for (const { line, message } of messages) {
      const row = rows.find((each) => each.id === message.id);
      assert.ok(row !== undefined, message.id);
      for (const reaction of line.reactions ?? []) {
        const { part, reactions } = shownOn(row, message, reaction.on);
        const shown = keysOf(reactions);
        assert.ok(
          shown.includes(reactionKey(part, reaction.emoji)),
          `${message.id}: ${reaction.emoji} on ${part}, shown ${shown.join(", ")}`,
        );
        checked += 1;
      }
    }
    assert.ok(checked >= 15);
  });
}

void test("the first photo of a message without text takes the message's reactions", () => {
  // Attachment 0 of a message without text is the message itself:
  // `attachment: 0` would be stored as a part no row draws.
  assert.equal(reactionAttachment("", 0), undefined);
  assert.equal(reactionAttachment("", 2), 2);
  assert.equal(reactionAttachment("Sunset timelapse", 0), 0);
  assert.equal(reactionAttachment("", undefined), undefined);
});

void test("sent as attachment 0, the first photo's hearts would show nowhere", () => {
  const [, group] = seeded();
  assert.ok(group !== undefined);
  const rows = messageRows(rowsOf([group.message]));
  const row = rows[0];
  assert.ok(row !== undefined);
  const parts = [
    ...row.reactions.map((reaction) => reaction.key.split(" ")[0]),
    ...row.blocks.flatMap((block) =>
      isBlock(block, "media") ? block.items.map((item) => item.part) : [],
    ),
  ];
  // What the app stores for `attachment: 0` is part 0, which no piece of
  // a message without text is.
  assert.ok(!parts.includes(String(reactionPart({ attachment: 0 }))));
});
