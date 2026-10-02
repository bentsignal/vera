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

The sender's name and photo come from their Accounts profile. Messages are
stored on the author's home PDS, so that profile lives on the same
deployment, but a Convex Component cannot read a sibling Component's tables.
The notification action instead calls `accounts.getProfile` through the
PDS's own public root router (`pds:dispatchQuery` at `CONVEX_CLOUD_URL`), the
same unauthenticated request any client makes. If that fails, the push uses
the name stored on the message and no photo.

The default export is a normal Convex Component whose TypeScript type also
carries the Messages protocol and its `accounts@1` requirement.
