# Contacts (decided with Shawn, 2026-10-18)

People add each other as contacts, give a contact their own name and
photo, and can choose to take new messages only from contacts.

## Decisions

- **Contacts are one-way.** Adding someone doesn't ask or tell them, like
  phone contacts. They're per signed-in account.
- **Who can message you**: **Everyone** (the default), **Contacts** (people
  you've added; they don't have to add you), or **Mutual Contacts** (you've
  added each other).
- It decides who can **start** a direct conversation with you and who can
  **add you to a group**. A conversation that already exists stays open,
  so if you message someone first, they can reply. Space invites already
  need you to accept, so they're unchanged.
- Someone who can't start a conversation with you sees it on your profile
  (no Message button, a note in its place) and in the New Message and
  group pickers (dimmed, with the same note).
- **A contact's name and photo show everywhere** the app shows that
  person: inbox, conversation headers, messages, reactions, activity,
  search, pickers, and pushes. Their own name and photo stay on their
  profile, under the contact's.
- @mentions still write the person's own name into the message, since
  everyone in the group reads it; only your view of it uses the contact
  name.
- Contacts is its own row on the More tab (see `more-tab.md`), with the
  Allow Messages From choice at the top of the Contacts screen. A profile
  has Add to Contacts, and a contact's profile has Edit Contact (name,
  photo, remove).

## Where it lives

Contacts and the setting live in the `messages` plugin, not `accounts`,
because the PDS checks them when a conversation starts and a Component
can't read another Component's tables.

- `contacts` table: owner, contact, optional `name` and `avatarUrl`,
  `addedAt`.
- `privacySettings` table: `messagesFrom` (`everyone`, `contacts`,
  `mutual`).
- `openDirect` (only when it creates the conversation), `createGroup`, and
  `addGroupMembers` fail with `NOT_ACCEPTING_MESSAGES`.
- `messagePermission({ accountId })` tells the app whether it can start a
  conversation with someone or add them to a group. It's routed to their
  home PDS, which keeps their setting and contacts.

## Later: other servers

With one server, the PDS creating a conversation keeps both people's
contacts and settings. Once accounts live on other servers, the creating
PDS can't see a remote recipient's, so the check has to move to the
recipient's home (for example when it accepts the membership mirror
described in `messaging-v1.md`). Until then a remote recipient's setting
only shows in the app, through `messagePermission`.
