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

## Your name and keywords

Settings > Notifications > Notify Me About Messages That Say has a My
Name switch (on until turned off) and a Keywords screen: a field that stays focused, so
you can type a word and press return, then the next, and the list below
it, each row with its delete control showing (iOS's editing list, swipe
too; a remove button on Android); scrolling the list at all puts the keyboard away. A message in a group or channel that
says your display name, with the switch on, or one of your keywords
counts as @mentioning you: whole words, any case ("Maya" matches "maya!"
but not "Mayans"; "deploy" doesn't match "deployed"). So it follows the
alert levels like a mention: one push where you'd hear mentions (never a
second one where you hear every message anyway), nothing at nothing, and
an Activity row of its own ("Maya said your name in …", "Maya said
“deploy” in …") that counts in the badge. Direct messages already reach
you whole, so they're left out.

- The settings are the same for every signed-in account, like the rest;
  each account's server matches that account's own name, so with two
  accounts either name notifies (as that account). Per-account settings
  are for later. The screen reads an account whose server has these
  settings, and they're sent only to servers that do.
- Keywords are stored trimmed and once each whatever their case, at most
  `MAX_KEYWORDS` of `MAX_KEYWORD_LENGTH` characters.
- The push works it out once, before sending (`notifications.send`):
  `wordCandidates` finds whose keyword the message says and who wants
  their name, the action checks those names (they live in Accounts,
  which the messages Component reads over HTTP, `accountProfile`), and
  `noteWords` records the matches on the message (`saidTo`, never sent
  to apps) and as `mentions` rows with `said`. From then on `alerts`
  treats `saidTo` as @mentions, so pushes, Activity, and the badge need
  nothing else. Members at `none` aren't looked up; everyone else is,
  one `getProfile` each (Accounts has no batch lookup; Convex caches the
  query). An edit keeps them, like the push they sent; deleting
  the message forgets them.
- No highlight in the message itself.

## Later

- @everyone (decided against for now).
- Federation: like every push, a mention reaches only people on the
  sender's PDS, and activity sees only the home PDS's mentions.
- Tapping a mention to open the person's profile.
