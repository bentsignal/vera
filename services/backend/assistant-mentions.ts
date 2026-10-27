// Whether a message calls an assistant into a conversation by
// @mentioning it (convex/summons.ts), as plain functions so they can be
// tested without Convex.

interface Mention {
  readonly accountId: string;
  readonly name: string;
}

/** The mentions `send` received, those that are well formed. */
function mentionsOf(mentions: unknown): Mention[] {
  if (!Array.isArray(mentions)) return [];
  return mentions.flatMap((mention: unknown) => {
    if (typeof mention !== "object" || mention === null) return [];
    const accountId: unknown = Reflect.get(mention, "accountId");
    const name: unknown = Reflect.get(mention, "name");
    return typeof accountId === "string" && typeof name === "string"
      ? [{ accountId: accountId.toLowerCase(), name }]
      : [];
  });
}

/**
 * Whether a message @mentions the assistant at `address`: the app's
 * mention of it (`mentions`, as `send` received it), or its `@username`
 * written out ("@Vera", "@vera"), not inside an address or a longer word,
 * and not the start of someone else's mention ("@Vera Smith").
 */
export function mentionsAssistant(
  { address, username }: { address: string; username: string },
  body: string,
  mentions: unknown,
) {
  const picked = mentionsOf(mentions);
  if (picked.some((mention) => mention.accountId === address)) return true;
  const others = picked.filter(
    (mention) => mention.name.length > username.length,
  );
  const written = new RegExp(
    String.raw`(?<![\p{L}\p{N}_.@])@${username}(?![\p{L}\p{N}_@])`,
    "giu",
  );
  return [...body.matchAll(written)].some(
    ({ index }) =>
      !others.some((mention) => body.startsWith(`@${mention.name}`, index)),
  );
}
