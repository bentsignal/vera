import type { ActionCtx } from "./_generated/server";
import type { Identity } from "./devBots";
import { components } from "./_generated/api";
import {
  asAccount,
  botIdentity,
  BOTS,
  channelsOf,
  pick,
  queryAs,
  REPLIES,
  request,
  stringField,
} from "./devBots";

// Development only: seed conversations for the signed-in account. See dev.ts.

/** A believable back-and-forth spread over past days, oldest first. */
function history(
  authors: readonly { address: string; name: string }[],
  count: number,
  days: number,
) {
  const start = Date.now() - days * 24 * 60 * 60 * 1000;
  const step = (days * 24 * 60 * 60 * 1000) / count;
  return Array.from({ length: count }, (_, index) => {
    const author = pick(authors, Math.floor(index / 3) + index * 7);
    const withImage = index % 37 === 5;
    return {
      attachments: withImage
        ? [
            {
              height: 600,
              kind: "image" as const,
              mimeType: "image/jpeg",
              name: "photo.jpg",
              size: 120_000,
              url: `https://picsum.photos/seed/vera-${index}/800/600`,
              width: 800,
            },
          ]
        : [],
      authorId: author.address,
      authorName: author.name,
      body: withImage ? "" : `${pick(REPLIES, index * 13 + 5)} (#${index + 1})`,
      messageId: crypto.randomUUID(),
      sentAt: Math.round(start + index * step),
    };
  });
}

async function importHistory(
  ctx: ActionCtx,
  conversationId: string,
  messages: ReturnType<typeof history>,
) {
  // Keep each mutation small.
  for (let start = 0; start < messages.length; start += 100) {
    await ctx.runMutation(components.messages.history.importHistory, {
      conversationId,
      messages: messages.slice(start, start + 100),
    });
  }
}

interface Author {
  readonly address: string;
  readonly name: string;
}

export async function seedProfiles(ctx: ActionCtx) {
  for (const bot of BOTS) {
    await ctx.runMutation(components.accounts.dispatcher.dispatchMutation, {
      ...request,
      identity: botIdentity(bot),
      operation: {
        args: { avatarUrl: null, displayName: bot.name },
        type: "upsertMyProfile",
      },
    });
  }
}

/** One very long DM for list and pagination testing, and short ones. */
export async function seedDirects(
  ctx: ActionCtx,
  me: Author,
  bots: readonly Identity[],
  authors: readonly Author[],
) {
  for (const [index, bot] of bots.entries()) {
    const conversationId = stringField(
      await asAccount(ctx, bot, {
        args: { accountId: me.address },
        type: "openDirect",
      }),
      "conversationId",
    );
    const long = index === 0;
    await importHistory(
      ctx,
      conversationId,
      history([me, authors[index] ?? me], long ? 600 : 25, long ? 30 : 4),
    );
  }
}

export async function seedGroup(
  ctx: ActionCtx,
  me: Author,
  authors: readonly Author[],
) {
  const [maya, jonah, priya] = [
    botIdentity(BOTS[0]),
    botIdentity(BOTS[1]),
    botIdentity(BOTS[2]),
  ];
  const conversationId = stringField(
    await asAccount(ctx, jonah, {
      args: {
        members: [me.address, maya.accountId, priya.accountId],
        name: "Weekend crew",
      },
      type: "createGroup",
    }),
    "conversationId",
  );
  await importHistory(
    ctx,
    conversationId,
    history([me, ...authors.slice(0, 3)], 120, 6),
  );
  // A live message so the inbox has an unread conversation.
  await asAccount(ctx, maya, {
    args: {
      attachments: [],
      body: "Seeded! Reply here and I'll answer.",
      conversationId,
      messageId: crypto.randomUUID(),
    },
    type: "send",
  });
}

export async function seedSpace(
  ctx: ActionCtx,
  me: Author,
  bots: readonly Identity[],
  authors: readonly Author[],
) {
  const owner = bots.at(-1);
  if (owner === undefined) throw new Error("Missing bots");
  const spaceId = stringField(
    await asAccount(ctx, owner, {
      args: { name: "Bot Lounge" },
      type: "createSpace",
    }),
    "spaceId",
  );
  await asAccount(ctx, owner, {
    args: {
      members: [me.address, ...bots.map((bot) => bot.accountId)],
      spaceId,
    },
    type: "addSpaceMembers",
  });
  for (const name of ["random", "links"]) {
    await asAccount(ctx, owner, {
      args: { name, spaceId },
      type: "createChannel",
    });
  }
  const space = await queryAs(ctx, owner, { args: { spaceId }, type: "space" });
  for (const channel of channelsOf(space)) {
    await importHistory(
      ctx,
      channel.conversationId,
      history(authors, channel.name === "general" ? 250 : 30, 10),
    );
  }
  return spaceId;
}
