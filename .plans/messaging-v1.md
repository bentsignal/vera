# Messaging v1

Scope for the first mobile release: DMs, groups, minimal spaces with text
channels, attachments, link previews, read state, and push notifications. All
of it ships in the `messages` plugin so one Component owns the hot path. Split
spaces into their own plugin once cross-plugin orchestration exists.

## Model

- **Conversation**: `direct`, `group`, or `channel`.
  - Direct IDs are deterministic: `direct:<a>:<b>` with the two addresses
    sorted, so either side computes the same ID on any server.
  - Group and channel IDs are `<kind>:<host domain>:<uuid>`. The host is the
    creator's home PDS, which holds the canonical membership.
- **Membership**: one row per (conversation, member) with role and
  `lastReadAt`. Every read and write checks membership. Channels have no member
  rows; membership comes from the space.
- **Space**: name, owner, members (owner or member role), ordered channels.
  Owners manage channels and members; members read and post everywhere.
- **Message**: author, body, attachments, optional link preview, `sentAt`.
  Stored on the author's home PDS.

## Behavior

- `inbox` lists the caller's direct and group conversations by latest activity,
  with the last message and an unread count.
- `list` pages backward from `before` (newest first), limited to 50 per page.
- `send` accepts a client-generated `messageId` for idempotent retries. A
  retried ID from another author is rejected instead of returning that
  author's message.
- Link previews: `send` schedules an internal action that fetches the first URL
  and stores Open Graph title, description, image, and site name.
- Push: members register Expo push tokens with the plugin. `send` schedules an
  internal action that notifies every other member, skipping muted ones.

## Files

The host owns uploads because providers need secrets (Components cannot read
environment variables). `convex/files.ts` issues upload targets through a
provider interface; Vera's provider is bunny.net (Storage for images and files
through an HTTP-action proxy, Stream for video with direct TUS uploads). A
Convex-storage provider covers development until bunny.net credentials exist.
Messages store public URLs, so readers on any server can load them.

## Later: other servers

With one production server, every member is local. For federation, a
non-host server needs a copy of membership to authorize reads of its local
messages. The plan is for the conversation host to push membership changes to
each participant's home PDS, which stores them as a membership mirror.
`list` already returns participant routes so clients fan out reads.
