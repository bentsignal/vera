export const env = {
  /**
   * The home PDS domain. Accounts are addresses on this domain
   * (`username@vera.chat`). EAS build profiles set it per environment.
   */
  veraDomain: process.env.EXPO_PUBLIC_VERA_DOMAIN ?? "dev.vera.chat",
  /**
   * Development builds talk to the dev PDS (or a worktree's own one,
   * `<branch>.dev.vera.chat`), which enables test tools.
   */
  get devTools() {
    return (
      this.veraDomain === "dev.vera.chat" ||
      this.veraDomain.endsWith(".dev.vera.chat")
    );
  },
  /**
   * A production bundle served to the dev client for measuring performance
   * (`VERA_METRO_PROFILE=1 scripts/sim.sh up`), which keeps the scripts'
   * hooks (`globalThis.veraDev`) that only development bundles have
   * otherwise.
   */
  profileBundle: process.env.EXPO_PUBLIC_PROFILE_BUNDLE === "1",
  /** Identifies the app to Expo's push service. */
  easProjectId: "5680db13-57a8-4b74-ae41-1f52abbda0b1",
};
