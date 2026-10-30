import type { Infer } from "convex/values";
import { defineOperation } from "@decentralized-convex/plugin";
import { v } from "convex/values";

// Contacts, and who can message an account (see `.plans/contacts.md`).

/**
 * Someone the caller added. `name` and `avatarUrl` are the caller's own
 * for them, which apps show instead of the person's; absent shows theirs.
 */
export const contact = v.object({
  accountId: v.string(),
  addedAt: v.number(),
  avatarUrl: v.optional(v.string()),
  name: v.optional(v.string()),
});

export type Contact = Infer<typeof contact>;

/**
 * Who can start a direct conversation with an account or add it to a
 * group: anyone, the people it added, or the people it added who added it
 * back.
 */
export const messagesFrom = v.union(
  v.literal("everyone"),
  v.literal("contacts"),
  v.literal("mutual"),
);

export type MessagesFrom = Infer<typeof messagesFrom>;

export const privacySettings = v.object({ messagesFrom });

export type PrivacySettings = Infer<typeof privacySettings>;

/**
 * Whether the caller can start a direct conversation with someone (or
 * they already have one), and whether the caller can add them to a group.
 */
export const messagePermission = v.object({
  direct: v.boolean(),
  groups: v.boolean(),
});

export type MessagePermission = Infer<typeof messagePermission>;

/** At most this many contacts per account. */
export const MAX_CONTACTS = 2000;

/** The contacts operations, part of `messagesProtocol`. */
export const contactMutations = {
  /**
   * Adds someone to your contacts, or changes one. `name` and `avatarUrl`
   * set your own name and photo for them; null goes back to theirs, and
   * left out stays as it is.
   */
  saveContact: defineOperation({
    args: v.object({
      accountId: v.string(),
      avatarUrl: v.optional(v.union(v.null(), v.string())),
      name: v.optional(v.union(v.null(), v.string())),
    }),
    returns: v.null(),
  }),
  removeContact: defineOperation({
    args: v.object({ accountId: v.string() }),
    returns: v.null(),
  }),
  /** Chooses who can message you (see `messagesFrom`). */
  setPrivacySettings: defineOperation({
    args: v.object({ messagesFrom: v.optional(messagesFrom) }),
    returns: v.null(),
  }),
};

export const contactQueries = {
  /** Your contacts, the most recently added first. */
  contacts: defineOperation({
    args: v.object({}),
    returns: v.array(contact),
  }),
  /** Who can message you; everyone until you choose. */
  privacySettings: defineOperation({
    args: v.object({}),
    returns: privacySettings,
  }),
  /**
   * Whether you can message someone (see `messagePermission`). Their home
   * PDS keeps their settings, so the query goes there too, and any PDS
   * that says no wins.
   */
  messagePermission: defineOperation({
    args: v.object({ accountId: v.string() }),
    returns: messagePermission,
  }),
};
