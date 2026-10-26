// Native runtimes (an app binary's fingerprint, see docs/releasing.md →
// Binaries, channels, and runtimes) too old to keep: the backend serves
// them as a live query (`release.outdatedRuntimes`), and a production app
// whose own runtime is listed covers the screen with "Update Vera" and one
// button to TestFlight or Play (apps/mobile/src/features/updates). A
// binary only gets over-the-air updates for its own runtime, so this is
// how one that can never get a new feature over the air is told to update.
//
// List a runtime only once its replacement store build is available to
// everyone on that platform: on TestFlight for the Team and Friends
// groups, or live in Play internal testing. Never list the current one.
// Ship it with `pnpm release backend production`; take it out the same
// way if the new build is pulled. docs/next-release.md has the order.

export const OUTDATED_RUNTIMES = {
  android: new Array<string>(),
  ios: new Array<string>(),
};
