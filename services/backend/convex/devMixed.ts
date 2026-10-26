import { v } from "convex/values";

import type { ActionCtx } from "./_generated/server";
import type { Identity } from "./devBots";
import type { Author } from "./devSeed";
import { LINES, reactionAttachment } from "../dev-mixed-lines";
import { components } from "./_generated/api";
import { action } from "./_generated/server";
import {
  asAccount,
  botIdentity,
  BOTS,
  requireCaller,
  stringField,
} from "./devBots";
import { seedProfiles } from "./devSeed";

// Development only (see dev.ts): a group with every bot and a DM with one,
// each with the same short history of every kind of message the list
// draws: photo groups and single photos, videos, a photo and video
// together, a file, links, long and short text, captions, and reactions on
// single photos, videos and files of a group (not only on the message).
// The same every time, so a phone and a simulator can be compared:
// `npx convex run devMixed:seed --identity …` (or the app's dev tools),
// then try typing with `dev:replyToMe` (one bot in the DM, three in the
// group), `dev:replyScene` and `dev:typingCrowd`.

/** `LINES` as messages in a conversation, a minute apart, ending now. */
function history(authors: readonly Author[]) {
  const end = Date.now() - 60_000;
  return LINES.map((line, index) => {
    const author = authors.at(line.from);
    if (author === undefined) throw new Error(`No author ${line.from}`);
    return {
      line,
      message: {
        attachments: [...(line.attachments ?? [])],
        authorId: author.address,
        authorName: author.name,
        body: line.body,
        messageId: crypto.randomUUID(),
        sentAt: end - (LINES.length - index) * 60_000,
      },
    };
  });
}

async function fill(
  ctx: ActionCtx,
  conversationId: string,
  authors: readonly Author[],
  bots: readonly (Identity | undefined)[],
) {
  const messages = history(authors);
  await ctx.runMutation(components.messages.history.importHistory, {
    conversationId,
    messages: messages.map(({ message }) => message),
  });
  for (const { line, message } of messages) {
    for (const reaction of line.reactions ?? []) {
      // In the DM, only its one bot reacts.
      const bot = bots[reaction.by] ?? bots[1];
      if (bot === undefined) continue;
      await asAccount(ctx, bot, {
        args: {
          attachment: reactionAttachment(line.body, reaction.on),
          conversationId,
          emoji: reaction.emoji,
          messageId: message.messageId,
          on: true,
        },
        type: "react",
      });
    }
  }
}

export const seed = action({
  args: {},
  returns: v.object({ direct: v.string(), group: v.string() }),
  handler: async (ctx) => {
    const caller = await requireCaller(ctx);
    await seedProfiles(ctx);
    const me = { address: caller.accountId, name: caller.name };
    const bots = BOTS.map(botIdentity);
    const authors = [
      me,
      ...bots.map((bot) => ({ address: bot.accountId, name: bot.name })),
    ];
    const maya = bots.at(0);
    if (maya === undefined) throw new Error("Missing bots");
    const group = stringField(
      await asAccount(ctx, maya, {
        args: {
          members: [me.address, ...bots.map((bot) => bot.accountId)],
          name: "Mixed media",
        },
        type: "createGroup",
      }),
      "conversationId",
    );
    await fill(ctx, group, authors, [undefined, ...bots]);
    const direct = stringField(
      await asAccount(ctx, maya, {
        args: { accountId: me.address },
        type: "openDirect",
      }),
      "conversationId",
    );
    // Everyone but you is Maya in the DM.
    const mayaAuthor = authors.at(1);
    if (mayaAuthor === undefined) throw new Error("Missing bots");
    await fill(
      ctx,
      direct,
      [me, ...bots.map(() => mayaAuthor)],
      [undefined, maya],
    );
    return { direct, group };
  },
});
