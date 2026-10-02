# AGENTS.md

## Repository summary

Vera is a decentralized, easily self-hostable messaging platform built on
decentralized Convex. The first release is a mobile app (`apps/mobile`) backed
by Vera's own PDS (`services/backend`). Product and infrastructure decisions
are in [docs/mobile-launch.md](docs/mobile-launch.md); the framework design is
in [docs/architecture.md](docs/architecture.md) and
[docs/versioning.md](docs/versioning.md). Read those before asking design or
infrastructure questions; treat recorded decisions as settled.

## Project knowledge

Record decisions, plans, and durable context as Markdown in this repository
(`docs/`, package READMEs, or `.plans/`). Do not use external memory or task
CLIs (such as UAV) or Claude Code auto memory for this project.

## Computer use

For anything that needs a browser, dashboard, or GUI (for example the Convex,
Vercel, or bunny.net dashboards), use the Codex CLI with the GPT 6.1 Sol model,
headless where possible, instead of driving the screen yourself:
`codex exec -m gpt-6.1-sol "<task>"`. Prefer each
service's CLI or API first. Never open repeated browser tabs or login pages in
the background; tell Shawn before anything opens on his machine.

## Git workflow

The agent owns git for this repository:

- Never commit directly to `main`. Start each change on a short-lived branch
  from an up-to-date `main`.
- Keep each pull request to one coherent change, with a description covering
  the summary and the validation that was run.
- Commit, push, open the PR, review the diff yourself, wait for CI, then merge
  with a merge commit and delete the branch.
- Do not leave work uncommitted between sessions. If work must pause, push it to
  its branch and note its state in the PR.

## Phone builds

When Shawn asks for a "development build" (or a build for his iPhone), make
the standalone `internal` EAS build: Release JavaScript bundled into the app,
against the dev PDS, no dev server needed. Never build the dev client (the
`development` profile) unless he asks for a "dev client" by name. See
[apps/mobile/README.md](apps/mobile/README.md#eas) for the build and upload
commands.

## Required validation after changes

At the end of every run, run these in order:

1. `pnpm run lint`
2. `pnpm run typecheck`
3. `pnpm run test`

If all succeed, run `pnpm run format:fix`, then summarize the changes.

## Decentralized Convex release invariant

All official `@decentralized-convex/*` packages and the wire protocol use one
exact ecosystem version. The source of truth is
`packages/decentralized-convex-core/src/release.ts`.

- Never version one decentralized Convex package independently.
- On every release, bump every `@decentralized-convex/*` `package.json` and
  every internal `workspace:<version>` dependency together.
- Every package owns a root `metadata.ts` and exports its
  `decentralizedConvexPackage` object from `./metadata`. Update that package's
  `lastChanged` only when the package actually changes.
- Never add a registry of package metadata to core. Release tooling discovers
  and validates the standardized package exports.
- Do not write a plugin protocol version manually; `definePluginProtocol`
  injects the ecosystem version.
- Run `pnpm run decentralized-convex:check`; it is also enforced by lint.
- Component data upgrades belong behind the PDS management surface. Do not ask
  application developers to run plugin-specific migration commands directly.
