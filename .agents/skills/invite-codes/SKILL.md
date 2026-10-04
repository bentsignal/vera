---
name: invite-codes
description: Create, list, or deactivate Vera sign-up invite codes. Use when Shawn asks for a new invite/sign-up code for friends, asks who used a code, or says a code can be turned off.
---

# Vera invite codes

Sign-up requires an invite code. Codes live in the production Convex
deployment (`inviteCodes` table), are multi-use, and stay valid until
deactivated. Each sign-up records which code it used.

Run every command from `services/backend`. Production needs `--prod`; drop it
only when Shawn explicitly asks for a development code.

## Create a code

```sh
npx convex run invites:create '{"label":"<who it is for>"}' --prod
```

The command prints the code, for example `K7QM-3XPD`. Give Shawn the code
exactly as printed. Codes are case-insensitive and the dash is optional, so
friends can type `k7qm3xpd`. Use a short label describing who the code is for
(for example `"college friends"`); ask only if Shawn gives no hint.

## Claim a reserved username

Names like `support`, `help`, `admin`, and `vera` are reserved (see
`services/backend/README.md`), so normal sign-ups can't take them. When Shawn
wants one of those accounts, make a code for that username:

```sh
npx convex run invites:create '{"label":"support account","username":"support"}' --prod
```

That code signs up only `support`; once the account exists it can't be used
again. Shawn signs up with it in the app like any other code. To give the
account the verified check afterwards, run
`npx convex run affiliations:add '{"address":"support@vera.chat"}' --prod`.

## See codes and who used them

```sh
npx convex run invites:list --prod
```

Each entry has `code`, `label`, `active`, `username` (set when the code is
for one username), and `accounts` (the addresses that
signed up with it). Summarize this for Shawn instead of pasting raw JSON.

## Deactivate a code

```sh
npx convex run invites:deactivate '{"code":"K7QM-3XPD"}' --prod
```

Deactivating stops new sign-ups with that code. Existing accounts are not
affected. If Shawn does not say which code, run `invites:list` and confirm the
one he means before deactivating.
