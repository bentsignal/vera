# `@decentralized-convex/messages`

First-party authenticated Messages protocol and Convex Component.

The protocol explicitly requires `accounts@1`, so a host cannot install
Messages without a compatible Accounts plugin. Messages receives canonical
identity from the root PDS router and keeps its hot read/write path inside one
Component boundary.

It covers direct conversations, groups, and spaces with text channels, plus
attachments (as public URLs), Open Graph link previews, emoji reactions,
read state, muting, and Expo push notifications. Every read and write checks membership; channel
membership comes from the space. Design notes live in
[`.plans/messaging-v1.md`](../../.plans/messaging-v1.md).

`messages.list` returns one page of messages, newest first, while carrying the
conversation's member addresses as transport metadata. The core client reads
that metadata from home and discovers the current participant PDS deployments.

```ts
import messages from "@decentralized-convex/messages/convex.config";
```

`messages.inbox` lists direct messages and groups. With `{ channels: true }`
it also lists the channels of your spaces, each with its `spaceName`, so an
app can show every conversation in one inbox. Per-account settings live on
the member row: `messages.setPinned` pins any conversation (`pinnedAt`), and
`messages.setShowInInbox` leaves a channel out of that inbox while it stays
in its space (`showInInbox`, on by default). Channels get a member row the
first time one of these, or a read, is stored.

People join spaces by accepting an invitation or opening an invite link.
`messages.inviteToSpace` (any member) leaves a pending invitation that
`messages.spaceInvites` lists for the invitee until they call
`messages.acceptSpaceInvite` or `messages.declineSpaceInvite`; a space lists
its pending invitees in `invited`. `messages.createSpaceInviteLink` (any
member) returns a random code that lasts `expiresIn` milliseconds (at most a
year), or forever without it. `messages.spaceInviteLinkPreview` shows any
signed-in account where a code leads, and `messages.joinSpaceWithLink` joins
through it. `messages.spaceInviteLinks` lists a space's live links (owners see
all, members their own). Its maker or an owner can change how long one
lasts with `messages.setSpaceInviteLinkExpiry` (measured from when it was
made) or delete it with `messages.revokeSpaceInviteLink`. `messages.addSpaceMembers`, which adds people
without asking, remains for apps from before invitations.

Reactions follow the same author-home rule as messages: `messages.react`
stores your reaction on your home PDS, and `messages.reactions` (given the
message IDs on screen) gathers reactions from every member's PDS.

## Push notifications

Each new message sends one Expo push per recipient device (muted
conversations and the author are skipped). The push is shaped for iOS
communication notifications:

| Field            | Value                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`          | Sender's display name                                                                                                                        |
| `subtitle`       | Group name, or `Space #channel`; omitted for direct messages                                                                                 |
| `body`           | Message preview (or "Sent a photo" and similar)                                                                                              |
| `mutableContent` | `true`, so the app's Notification Service Extension can run                                                                                  |
| `threadId`       | Conversation ID                                                                                                                              |
| `data`           | `accountId`, `conversationId`, `conversationName` (null for DMs), `kind`, `messageId`, `senderAvatarUrl` (or null), `senderId`, `senderName` |
| `badge`          | The recipient's app icon badge (see below); left out if it can't be counted                                                                  |

The sender's name and photo come from their Accounts profile. Messages are
stored on the author's home PDS, so that profile lives on the same
deployment, but a Convex Component cannot read a sibling Component's tables.
The notification action instead calls `accounts.getProfile` through the
PDS's own public root router (`pds:dispatchQuery` at `CONVEX_CLOUD_URL`), the
same unauthenticated request any client makes. If that fails, the push uses
the name stored on the message and no photo.

Inviting people to a space sends each invitee a push too: the space's name
as the title, "<inviter> invited you to join <space>" as the body, a `badge`,
and `data` of `accountId`, `invitedBy`, `kind: "spaceInvite"`, `spaceId`, and
`spaceName`.

`badge` is what an inbox-and-spaces app would show on its tabs together:
the recipient's inbox conversations with anything unread (channels left out
of the inbox don't count; muted conversations do), plus their pending space
invitations. Only this PDS's data is counted, and a push knows only its own
account, so an app signed into several accounts should set the total itself
while it runs.

The default export is a normal Convex Component whose TypeScript type also
carries the Messages protocol and its `accounts@1` requirement.
