export const env = {
  /**
   * The home PDS domain. Accounts are addresses on this domain
   * (`username@vera.chat`). EAS build profiles set it per environment.
   */
  veraDomain: process.env.EXPO_PUBLIC_VERA_DOMAIN ?? "dev.vera.chat",
};
