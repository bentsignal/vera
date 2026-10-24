# @mentions and alert levels

Typing `@` in a group or channel lists its members (never you) above the
message field; typing filters by the start of any word of a display name or
the username. Picking someone writes `@Display Name ` into the message.
Backspacing into a mention deletes all of it, and editing inside one turns
it back into plain text. Direct messages have no mentions.

## Data

- A message carries `mentions: { accountId, name }[]`, `name` being what
  follows the `@` in its body (the display name when sent). The body stays
  readable text, so pushes, previews, and older apps show `@Maya Chen`
  plainly. Apps bold every `@name` occurrence; when it names you, it's in
  the accent color too.
- The server keeps only mentions of other members whose `@name` is in the
  body, and writes a `mentions` row per mentioned account for activity.
- Matching names in the text, rather than storing offsets, survives the
  app hiding previewed links from the text it shows.

## Alerts

Each group, channel, and space alerts you about all messages, only
@mentions, or nothing, in Activity and in pushes alike. A channel's choice
wins over its space's, and those over your defaults in Settings >
Notifications (Group Chats, Space Channels). Choosing what something would
get anyway stores no choice, so it follows the default again. Direct
messages keep Hide Alerts (everything or nothing).

- Long-press menus offer the two levels a group or channel isn't at.
- Rows show a crossed-out bell at nothing and an @ at only @mentions.
- Mute flags from before levels read as nothing, and older apps' Hide
  Alerts and `groups`/`channels` switches map onto the levels.
- Activity lists each mention as its own row ("Maya mentioned you in
  …"), taken out of its conversation's messages row so nothing counts
  twice.

## Your name

Settings > Notifications > Messages With Your Name (off until turned on)
pushes a message that says your display name as if it @mentioned you:
whole words, any case ("Maya" matches "maya!" but not "Mayans"). It
follows the same alert levels, so it adds pushes only where you'd hear
mentions but not every message (a group or channel at only @mentions, or
a thread you're not in); a conversation at nothing stays silent.

- The push sender (`notifications.send`, an action) checks names, since
  display names live in Accounts, which the messages Component reads
  over HTTP (`accountProfile`). `nameListeners` limits the lookups to
  members who turned it on and wouldn't hear of the message otherwise.
- Pushes only: it adds no Activity row, badge, or highlight.

## Later

- @everyone (decided against for now).
- Federation: like every push, a mention reaches only people on the
  sender's PDS, and activity sees only the home PDS's mentions.
- Tapping a mention to open the person's profile.
