/** The kinds of things whose IDs name their creator's home domain. */
export type CreatedKind = "channel" | "group" | "space";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function domainOf(accountId: string) {
  return accountId.slice(accountId.lastIndexOf("@") + 1);
}

/**
 * The ID of a new group, space, or channel: its kind, its creator's home
 * domain, and a random UUID. Apps may make one themselves and pass it to
 * the create operation, so they can show and open the new thing before the
 * PDS answers.
 */
export function createdId(kind: CreatedKind, accountId: string, uuid: string) {
  return `${kind}:${domainOf(accountId)}:${uuid}`;
}

/** The one conversation between two addresses, whoever opens it. */
export function directConversationId(left: string, right: string) {
  return `direct:${[left, right].sort().join(":")}`;
}

/** Whether `id` is one `createdId` could have made for this creator. */
export function isCreatedId(id: string, kind: CreatedKind, accountId: string) {
  const prefix = createdId(kind, accountId, "");
  return id.startsWith(prefix) && UUID.test(id.slice(prefix.length));
}

/**
 * The title of a group without a name: the people in it, such as
 * "Maya, Leo & Priya". Long lists are left for the screen to truncate.
 * Members are listed in address order, as the PDS stores them.
 */
export function listNames(names: readonly string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names.at(-1) ?? ""}`;
}

/** How a channel name is stored: lowercase, without "#", dashes for spaces. */
export function channelName(value: string) {
  return value.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-");
}
