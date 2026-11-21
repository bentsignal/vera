export const env = {
  /**
   * The home PDS domain. Accounts are addresses on this domain
   * (`username@vera.chat`). EAS build profiles set it per environment.
   */
  veraDomain: process.env.EXPO_PUBLIC_VERA_DOMAIN ?? "dev.vera.chat",
  /**
   * What a dev PDS asks of every dev tools request
   * (services/backend/dev-tools.ts). Only the bundles Shawn's Metro serves
   * have it (scripts/lib/metro.sh); builds and updates made on EAS don't,
   * since anyone can download a published update.
   */
  devToolsSecret: process.env.EXPO_PUBLIC_DEV_TOOLS_SECRET ?? "",
  /**
   * Development bundles that talk to the dev PDS (or a worktree's own one,
   * `<branch>.dev.vera.chat`) and carry its secret have test tools.
   */
  get devTools() {
    return (
      this.devToolsSecret !== "" &&
      (this.veraDomain === "dev.vera.chat" ||
        this.veraDomain.endsWith(".dev.vera.chat"))
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
