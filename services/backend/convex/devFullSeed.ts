import type { ActionCtx } from "./_generated/server";
import type { Author } from "./devSeed";
import { components } from "./_generated/api";
import {
  asAccount,
  botIdentity,
  BOTS,
  channelsOf,
  pick,
  queryAs,
  stringField,
} from "./devBots";

// Development only: as many conversations as the app keeps on the device
// (20, see `features/saved` in the app), each with more than the 50
// messages it keeps, written like real ones: short replies and long
// paragraphs, links, photos of every shape, reactions, and threads. For
// measuring what keeping them costs, and trying the app offline. See dev.ts.

const SHORT = [
  "haha yes",
  "wait really?",
  "omw",
  "lol",
  "👀",
  "same",
  "ok deal",
  "love this",
  "🙌🙌",
  "can't tonight, tomorrow?",
  "who's driving?",
  "sounds good to me",
];

const MEDIUM = [
  "Just got back, the line was way shorter than last time. Want me to grab you one?",
  "I moved the meeting to Thursday at 3 so everyone can make it.",
  "Did anyone find a charger? I think I left mine at the cabin.",
  "Honestly the second half of the book is so much better, stick with it.",
  "Running about 10 minutes late, start without me if you need to.",
  "Can someone send me the address again? It's not in my calendar.",
  "That place on 5th has a new chef and the menu changed completely.",
  "I'll book the tickets tonight unless anyone objects.",
];

const LONG = [
  "Okay so here's the plan for Saturday: we meet at the trailhead at 8, do the loop counterclockwise so the steep part is in the shade, and stop at the lake for lunch. If it rains we'll push to Sunday. Bring layers, it gets cold up top even in summer, and someone please remember the bug spray this time.",
  "I've been thinking about what you said yesterday and I think you're right. We've been trying to do too many things at once and none of them are getting the attention they need. What if we pick the two that matter most for the next month and park the rest? I'd rather finish two things well than five things badly.",
  "Long story short, the landlord says the repair is scheduled for next week, but they said that last month too. I'm going to call again Monday and if nothing happens I'll put it in writing. Let me know if any of you have had the same issue, it might help to send it together.",
  "Update from the vet: she's totally fine, it was just something she ate. They gave us some medicine for a few days and said to keep an eye on her, but she's already back to stealing socks and running laps around the living room at 2am, so I think we're good.",
];

const LINKS = [
  "This is the one I mentioned https://github.com/expo/expo",
  "Recipe for tonight https://www.seriouseats.com/the-food-lab",
  "Have you seen this? https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "Tickets go on sale Friday https://www.ticketmaster.com",
  "Map of the route https://maps.apple.com/?q=Yosemite",
];

/** Photo shapes people send, with sizes typical of each. */
const PHOTOS = [
  { height: 1600, size: 480_000, width: 1200 },
  { height: 1200, size: 520_000, width: 1600 },
  { height: 1080, size: 350_000, width: 1080 },
  { height: 900, size: 640_000, width: 2400 },
  { height: 2532, size: 910_000, width: 1170 },
];

const EMOJI = ["❤️", "👍", "😂", "🔥", "😮", "🎉", "😢"];

const GROUPS = [
  "Trip planning",
  "Book club",
  "Family",
  "Climbing",
  "Roommates",
  "Design crit",
  "Fantasy league",
  "Dinner Friday",
];

const CHANNELS = [
  "photos",
  "links",
  "announcements",
  "design",
  "engineering",
  "music",
  "food",
  "travel",
  "random",
];

/** How many messages each conversation gets, more than the app keeps. */
const MESSAGES = 60;

function photos(seed: string, index: number) {
  const count = index % 10 === 0 ? 1 + (index % 4) : index % 3 === 0 ? 2 : 1;
  return Array.from({ length: count }, (_, photo) => {
    const shape = pick(PHOTOS, index + photo * 3);
    return {
      height: shape.height,
      kind: "image" as const,
      mimeType: "image/jpeg",
      name: `IMG_${4000 + index * 7 + photo}.jpg`,
      size: shape.size,
      url: `https://picsum.photos/seed/vera-full-${seed}-${index}-${photo}/${shape.width}/${shape.height}`,
      width: shape.width,
    };
  });
}

function body(seed: number) {
  const kind = seed % 10;
  if (kind < 4) return pick(SHORT, seed);
  if (kind < 7) return pick(MEDIUM, seed);
  if (kind < 9) return pick(LONG, seed);
  return pick(LINKS, seed);
}

/** A conversation's history, oldest first, ending `endsAgo` milliseconds ago. */
function history(
  seed: string,
  authors: readonly Author[],
  endsAgo: number,
  count = MESSAGES,
) {
  const end = Date.now() - endsAgo;
  const step = (5 * 24 * 60 * 60 * 1000) / count;
  return Array.from({ length: count }, (_, index) => {
    const author = pick(authors, Math.floor(index / 2) + index * 5);
    const withPhotos = index % 6 === 2;
    return {
      attachments: withPhotos ? photos(seed, index) : [],
      authorId: author.address,
      authorName: author.name,
      body: withPhotos && index % 12 === 2 ? "" : body(index * 7 + seed.length),
      messageId: crypto.randomUUID(),
      sentAt: Math.round(end - (count - index) * step),
    };
  });
}

/**
 * Reactions on about a third of the newest messages (`count` of them),
 * and replies in a thread for every 25 of them, from the bots in the
 * conversation.
 */
async function liven(
  ctx: ActionCtx,
  conversationId: string,
  messages: ReturnType<typeof history>,
  bots: readonly ReturnType<typeof botIdentity>[],
  count = 50,
) {
  const newest = messages.slice(-count);
  for (const [index, message] of newest.entries()) {
    if (index % 3 !== 0) continue;
    for (let count = 0; count <= index % 3; count += 1) {
      await asAccount(ctx, pick(bots, index + count), {
        args: {
          conversationId,
          emoji: pick(EMOJI, index + count * 2),
          messageId: message.messageId,
          on: true,
        },
        type: "react",
      });
    }
  }
  const roots = newest.filter((_, index) => index % 25 === 10);
  for (const root of roots) {
    for (let reply = 0; reply < 3; reply += 1) {
      await asAccount(ctx, pick(bots, reply), {
        args: {
          attachments: [],
          body: pick(MEDIUM, reply + root.sentAt),
          conversationId,
          messageId: crypto.randomUUID(),
          threadId: root.messageId,
          threadOnly: true,
        },
        type: "send",
      });
    }
  }
}

async function fill(
  ctx: ActionCtx,
  conversationId: string,
  authors: readonly Author[],
  bots: readonly ReturnType<typeof botIdentity>[],
  endsAgo: number,
  { count = MESSAGES, livened = 50 } = {},
) {
  const messages = history(conversationId, authors, endsAgo, count);
  for (let start = 0; start < messages.length; start += 100) {
    await ctx.runMutation(components.messages.history.importHistory, {
      conversationId,
      messages: messages.slice(start, start + 100),
    });
  }
  await liven(ctx, conversationId, messages, bots, livened);
}

function authorOf(bot: (typeof BOTS)[number]) {
  return { address: botIdentity(bot).accountId, name: bot.name };
}

/** The bot conversations: direct ones, groups, and a space's channels. */
export async function seedFull(ctx: ActionCtx, me: Author) {
  const bots = BOTS.map(botIdentity);
  const hour = 60 * 60 * 1000;
  let order = 0;
  for (const bot of BOTS) {
    const conversationId = stringField(
      await asAccount(ctx, botIdentity(bot), {
        args: { accountId: me.address },
        type: "openDirect",
      }),
      "conversationId",
    );
    order += 1;
    await fill(
      ctx,
      conversationId,
      [me, authorOf(bot)],
      [botIdentity(bot)],
      order * hour,
    );
  }
  for (const [index, name] of GROUPS.entries()) {
    const members = BOTS.slice(0, 2 + (index % 3));
    const conversationId = stringField(
      await asAccount(ctx, botIdentity(pick(BOTS, index)), {
        args: {
          members: [
            me.address,
            ...members.map((bot) => botIdentity(bot).accountId),
          ],
          name,
        },
        type: "createGroup",
      }),
      "conversationId",
    );
    order += 1;
    await fill(
      ctx,
      conversationId,
      [me, ...members.map(authorOf)],
      members.map(botIdentity),
      order * hour,
    );
  }
  const owner = botIdentity(BOTS[0]);
  const spaceId = stringField(
    await asAccount(ctx, owner, {
      args: { name: "Storage Lab" },
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
  for (const name of CHANNELS) {
    await asAccount(ctx, owner, {
      args: { name, spaceId },
      type: "createChannel",
    });
  }
  const space = await queryAs(ctx, owner, { args: { spaceId }, type: "space" });
  for (const channel of channelsOf(space)) {
    order += 1;
    await fill(
      ctx,
      channel.conversationId,
      [me, ...BOTS.map(authorOf)],
      bots,
      order * hour,
    );
  }
  return { conversations: order };
}

/**
 * One busy group with every bot: `count` messages, reactions on a third
 * of the newest `livened`, and a thread for every 25 of those, for
 * measuring what a long, lively conversation costs to open and follow.
 */
export async function seedBusy(
  ctx: ActionCtx,
  me: Author,
  { count, livened }: { count: number; livened: number },
) {
  const conversationId = stringField(
    await asAccount(ctx, botIdentity(BOTS[0]), {
      args: {
        members: [me.address, ...BOTS.map((bot) => botIdentity(bot).accountId)],
        name: "Busy group",
      },
      type: "createGroup",
    }),
    "conversationId",
  );
  await fill(
    ctx,
    conversationId,
    [me, ...BOTS.map(authorOf)],
    BOTS.map(botIdentity),
    60 * 1000,
    { count, livened },
  );
  return { conversationId };
}
