# More tab (decided with Shawn, 2026-10-17)

The Settings tab became **More**, so the tab has room for things that
aren't settings, such as contacts.

- Tabs: **Home · Activity · More · Search**. The icon is a 2×2 grid; an
  ellipsis looked odd in the tab bar.
- Not "You" or "Profile": you're signed into every account at once, so
  the tab isn't about one person.
- The page has the native large title, **More**, then the **Accounts**
  section as before (each account in a vertical list, the plus in the
  section header), then rows that each open their own screen:
  **Settings** (appearance, message style, themes, app icon,
  experimental) and **Notifications**, and **About** (version, channel,
  update) on its own.
- Tried and dropped: a page without a title, a single-account card, a
  sideways strip of accounts, a person-plus button in the bar, and a
  separate Accounts screen.
- No action rows hanging under a profile (Shawn doesn't like the split
  separator): an account's Change Photo became a camera badge on its
  photo (tap the profile to change it).
- An account's screen has no Home Server row. Sign Out is a red,
  full-width button at the bottom, confirmed with "Sign Out of
  <address>?" and no explanation.
- A new photo shows right away, dimmed under a spinner while it uploads;
  both fade away when it's done.
- Routes: `/more`, `/more/settings`, `/more/notifications`,
  `/more/account`, `/more/about`.

## Contacts

Contacts is its own row, above Settings (see `contacts.md`), at
`/more/contacts`.
