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

Link previews: a sent message gets a card for each of its first four
different links (`linkPreviews`, in order). Each card's `preview` is absent
while the author's PDS fetches it and null when it has none, so an app can
draw a placeholder from the start and cut the links out of the text
(`withoutUrls`). Apps call `messages.prefetchLinkPreviews` once typing
pauses and read the results with `messages.linkPreviews`. The PDS keeps
fetched previews in a cache for six hours (ten minutes for a link with
none), so a prefetched link's card is in the message when it's stored.
`linkPreview` still carries the first link's preview for older apps. The
server only fetches public http(s) hosts, with a 5 second timeout per
try and at most 512 KB of each page's head. Sites let different link
expanders through, so a page that comes back blocked or without Open
Graph tags is tried again as the next of `PAGE_AGENTS` (iMessage's, then
WhatsApp's, Slack's, Discord's, and a browser's; see `agents.ts`), for
up to 12 seconds in all. Apps load preview images as
`PREVIEW_IMAGE_USER_AGENT`, since some image CDNs block other crawlers
and Reddit only draws its real post image for link expanders. A tweet
(an x.com or twitter.com status link) comes from the API Twitter's
embeds use instead, and its card carries the tweet's `video` (an MP4 the
app can play, with `imageUrl` as its poster).

`messages.inbox` lists direct messages and groups. With `{ channels: true }`
it also lists the channels of your spaces, each with its `spaceName`, so an
app can show every conversation in one inbox. Per-account settings live on
the member row: `messages.setPinned` pins any conversation (`pinnedAt`), and
`messages.setShowInInbox` leaves a channel out of that inbox while it stays
in its space (`showInInbox`, on by default). Channels get a member row the
first time one of these, or a read, is stored.

`messages.createGroup` takes an optional `name`; apps title a group without
one with its other members' names (`listNames`, in address order), and its
pushes do the same for each recipient. Anyone in a group can add people
with `messages.addGroupMembers` (up to 50 in all); they join straight away
and see its earlier messages. `messages.memberEvents` lists who joined a
group (and who added them) and who left, oldest first, so apps can show
it between messages; other conversations have none. `createGroup`, `createSpace` (for the
space and its #general), and `createChannel` accept IDs the app made with
`createdId(kind, creator, uuid)`, so an app can show and open the new thing
before the PDS answers. The PDS checks that such an ID names the creator's
home domain; a retry with the same ID returns what exists, and any other
reuse fails with `ID_TAKEN`. Direct conversation IDs are
`directConversationId(a, b)`, so apps can open one right away too.

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

Mentions: `messages.send` takes `mentions`, each an `accountId` and the
`name` written after its `@` in the body (the display name at the time).
The PDS keeps only mentions of other members of the group or channel whose
`@name` is in the body, stores them on the message (`mentions`), and notes
each mentioned account in its `mentions` table so their activity finds
it. Direct messages have none. Apps bold `@name` wherever it appears.

Alerts: each group, channel, and space alerts an account about `all`
messages, only ones that `mentions` them, or `none` (no activity and no
pushes). `messages.setAlerts` chooses for a conversation and
`messages.setSpaceAlerts` for every channel of a space; a channel's choice
wins over its space's, and a space's or group's over the account's
defaults (`groupAlerts` and `channelAlerts` in the notification settings).
Choosing what it would get anyway follows those again. Conversations,
channels, and spaces report the level as `alerts`; `muted` (and
`setMuted`/`setSpaceMuted`) remain for older apps and mean `none`. Direct
messages are `all` or `none`.

Editing and deleting: `messages.editMessage` changes the text of the
caller's own message, and who it mentions (as `send` takes them); its
attachments stay, and it comes back with `editedAt`. Its link cards are
redone when its links change, and anyone it newly mentions finds it in
their activity, without a push. `messages.deleteMessage` deletes the
caller's own message for everyone, with the reactions and mentions stored
with it. A thread's original that has replies stays as a placeholder
(`deletedAt`, with no text, attachments, link previews, or mentions), so
its thread can still be opened, and goes once its last reply is deleted;
any other deleted message is gone. Deleting a reply takes it out of its
thread's count. Either operation fails with `NOT_MESSAGE_AUTHOR` on anyone
else's message. Replies stored on the author's PDS that quote the message
follow it: their quote takes the new text, or is marked `deleted` with
its text and attachment removed. Quotes name the message they're of
(`quote.messageId`); ones from before that are matched by author and
text. Replies stored on other PDSs keep their quote until federation
carries changes there. Inbox previews, unread counts, and activity skip
deleted placeholders.

Reactions follow the same author-home rule as messages: `messages.react`
stores your reaction on your home PDS, and `messages.reactions` (given the
message IDs on screen) gathers reactions from every member's PDS.

Activity: `messages.activity` lists what happened while the caller was
away, newest first: messages others sent (one item per conversation, with
the newest, a count, and the authors) and others' reactions to the caller's
messages (one item per message). Muted conversations and channels left out
of the inbox don't appear. With `{ mentions: true }`, each message that
@mentions the caller is a `mention` item of its own (from any conversation
not at `none`), and a conversation at `mentions` shows nothing else;
without it, a conversation at `mentions` lists just the messages that
mention the caller. With `{ aboutYou: true }`, activity is only what's
about the caller: no conversation items (the inbox has those), and each
reply to the caller's message sent in a group or channel is a `reply`
item of its own (from any conversation not at `none`, unless the caller
turned the thread's bell off, or it also mentions them). Apps report items
that came into view with
`messages.markActivitySeen` (each item's `key`, through its newest activity
`at`); an item stays for a day after it's seen (`ACTIVITY_SEEN_LIFETIME`),
then goes until something newer happens in it. `markRead` sees a
conversation's activity too (its messages, mentions, and replies to the
caller up to `readAt`, and its reactions so far). Unmuting a conversation or space starts clean: activity from while
it was muted never shows. Nothing older than a week
(`ACTIVITY_HORIZON`) shows, seen or not. Reactions name the message's
author (`messageAuthorId`) when the message is stored on the reactor's
PDS, which is how its author's activity finds them; reactions from before
that field don't appear. Like the inbox, only this PDS's messages and
reactions are listed.

## Push notifications

Each new message sends one Expo push per recipient device: to each other
member whose alerts let it through (everything, or a message that
mentions them), who has pushes on (and, for a direct message, direct
message pushes). The push is shaped for iOS
communication notifications:

| Field            | Value                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`          | Sender's display name                                                                                                                        |
| `subtitle`       | Group name (an unnamed group's other members), or `Space #channel`; omitted for direct messages                                              |
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

A new reaction sends the message's author a push too, 3 seconds later (if
it's still there): the reactor as the title and sender, "Reacted ❤️ to
“…”" as the body, and `data` like a message's with `kind: "reaction"` and
the `emoji`. It's skipped for reactions to your own messages.

Each account chooses which pushes it gets with
`messages.setNotificationSettings` (read with `messages.notificationSettings`):
`enabled` off silences all of them, and `directMessages`, `reactions`, and
`invites` turn off one kind each. Groups and channels follow their alerts
(above); `groups` and `channels` are whether those defaults aren't `none`.
A conversation's own alerts still apply on top.

Inviting people to a space sends each invitee a push too: the space's name
as the title, "<inviter> invited you to join <space>" as the body, a `badge`,
and `data` of `accountId`, `invitedBy`, `kind: "spaceInvite"`, `spaceId`, and
`spaceName`.

`badge` is what an app's activity view would count: the recipient's
`activity` items not yet seen (muted conversations and spaces, and channels
left out of the inbox, don't count), plus their pending space invitations.
A device whose app registered its token with `inbox` (the kinds of rows
its Inbox lists: `chats`, `channels`, `threads`) counts activity about the
caller instead (`aboutYou`), plus each Inbox row of those kinds with
something unread: direct messages, groups, and channels that alert about
every message, and threads the caller is in with unread replies.
Only this PDS's data is counted, and a push knows only its own account, so
an app signed into several accounts should set the total itself while it
runs.

The default export is a normal Convex Component whose TypeScript type also
carries the Messages protocol and its `accounts@1` requirement.

Replies and threads ([`.plans/threads.md`](../../.plans/threads.md)): `send`
with `threadId` replies to that message, in its thread (threads are flat, so
naming a reply replies to its original). The thread's first reply shows in
the conversation; later ones come back with `threadOnly` and stay out of
`list`, unread counts, and the inbox. Every reply carries a `quote` of its
original. `messages.thread` pages a thread's replies with its original, and
`messages.threadSummaries` counts the replies of the messages on screen,
gathered from every member's PDS like reactions. The original's author,
everyone who replies, and anyone who turns a thread's bell on
(`messages.setThreadFollowed`) are in it: they get its pushes (the
`replies` and `threadReplies` notification settings) and, with
`activity({ threads: true })`, an Activity item per thread with new
replies. They hear of a thread at any alert level but `none`, and anyone a
reply @mentions hears of it too (its `mention` item only for apps that
ask for threads, since only they can open it). `messages.markThreadRead`
sees the thread and its mentions of the caller, and `messages.threadState`
is the caller's bell and read state.

Finding threads: `messages.threads` pages a conversation's threads, newest
reply first (`THREAD_PAGE_SIZE` at a time, or fewer with `limit`, older
than `before`), each with its original, its counts, and the caller's
place in it (`following`, `lastReadAt`, `unreadCount`). With `mine`, only
threads the caller follows. Like summaries, each member's PDS lists the replies it stores and apps add
them up. `messages.inboxThreads` lists the threads the caller follows
across conversations, newest reply first (at most `MAX_INBOX_THREADS`),
each with its conversation and newest reply, leaving out muted
conversations and channels left out of the inbox as `activity` does. A
thread whose bell the caller turned off isn't theirs in either. Unread
counts leave out a thread's first reply, which is read in the
conversation.
