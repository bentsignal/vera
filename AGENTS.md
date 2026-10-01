# AGENTS.md

## Repository Summary

This project was initally an AI chat app, and is now being rebuilt as a decentralized, easily self-hostable messaing & email platform.

## Required Validation After Changes

At the end of every run, run the following commands in order:

1. `pnpm run lint`
2. `pnpm run typecheck`

If all of these succeed, run:

4. `pnpm run format:fix`

Then summarize changes for the user.

## Decentralized Convex Release Invariant

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
