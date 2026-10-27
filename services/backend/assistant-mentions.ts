// Whether a message calls an assistant into a conversation by
// @mentioning it (convex/summons.ts), as plain functions so they can be
// tested without Convex.

/**
 * Whether a message @mentions the assistant at `address`: the app's
 * mention of it (`mentions`, as `send` received it), or its `@username`
 * written out ("@Vera", "@vera"), not inside an address or a longer word.
 */
export function mentionsAssistant(
  { address, username }: { address: string; username: string },
  body: string,
  mentions: unknown,
) {
  const mentioned =
    Array.isArray(mentions) &&
    mentions.some(
      (mention: unknown) =>
        typeof mention === "object" &&
        mention !== null &&
        String(Reflect.get(mention, "accountId")).toLowerCase() === address,
    );
  return (
    mentioned ||
    new RegExp(
      String.raw`(?<![\p{L}\p{N}_.@])@${username}(?![\p{L}\p{N}_@])`,
      "iu",
    ).test(body)
  );
}
