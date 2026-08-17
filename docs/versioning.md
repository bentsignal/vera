# Decentralized Convex versioning and upgrades

## One ecosystem version

Every official `@decentralized-convex/*` npm package, plugin protocol, client
request, and server release uses one exact version. The initial release is
`0.1.0`. If any constituent changes, every package is republished together.

The source of truth is
`packages/decentralized-convex-core/src/index.ts`. It contains:

- the current ecosystem version;
- the ordered set of known releases;
- `lastChanged`, recording the ecosystem release in which each package or wire
  contract last actually changed.

`scripts/check-decentralized-convex-release.ts` verifies every official package
version and every internal dependency. It runs as part of `pnpm run lint`.
`definePluginProtocol` injects the ecosystem version, so plugin authors cannot
accidentally publish a different protocol version.

## Client-to-PDS compatibility

The PDS discovery descriptor advertises its current ecosystem version, when
the core wire contract last changed, and when each installed plugin contract
last changed. The generated application API embeds the same requirements.

Compatibility currently uses the conservative rule that every required
`lastChanged` value must match exactly. The overall ecosystem versions do not
need to match: a newer PDS is compatible when the contracts used by the client
are unchanged. Requests carry the client's ecosystem version for diagnostics
and the plugin's `lastChanged` value for server validation.

## Component upgrades

Each plugin is a Convex Component and owns its tables. Plugin packages will
eventually ship ordered migrations, while the PDS management surface will own
planning, starting, resuming, and reporting the complete upgrade. Application
developers must not need to discover or invoke plugin-specific migrations.

The current `pdsReleaseFromApp` and `pdsDescriptorFromApp` functions establish
that management boundary and derive release state from `definePdsApp`. They do
not run migrations yet. Until migration execution and persisted upgrade state
exist, the PDS must not claim that a data upgrade completed automatically.

## Release procedure

For a future release:

1. Add the new release to `DECENTRALIZED_CONVEX_RELEASES` and make it current.
2. Set every official package version to that exact release.
3. Set every internal decentralized Convex dependency to
   `workspace:<release>`.
4. Update `DECENTRALIZED_CONVEX_LAST_CHANGED` only for constituents that
   actually changed.
5. Add required Component migrations and compatibility tests.
6. Run `pnpm run decentralized-convex:check`, followed by the repository's
   required validation sequence.
