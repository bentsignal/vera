/** Vera's assistant accounts, by username on the account's own domain. */
const ASSISTANTS = ["vera"];

/**
 * The addresses of the assistants on an account's own PDS, which it can
 * message and @mention in any conversation.
 */
export function assistantsOf(address: string) {
  const domain = address.slice(address.lastIndexOf("@") + 1);
  return ASSISTANTS.map((username) => `${username}@${domain}`);
}
