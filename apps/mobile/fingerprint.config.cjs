// Native fingerprint (the runtime version over-the-air updates match on).
// eas.json only affects native builds through env such as
// VERA_NOTIFICATION_EXTENSION, which already reaches the hashed app config,
// so editing build profiles must not cut installed binaries off from updates.
/** @type {import('expo/fingerprint').Config} */
const config = {
  ignorePaths: ["eas.json"],
  // The iOS notification service extension's Swift is copied in by a config
  // plugin, so the default sources miss it; without this, a change to it
  // would never call for a new build. (Sources can't be limited to iOS, so
  // it counts toward Android's fingerprint too.)
  extraSources: [
    {
      type: "dir",
      filePath: "plugins/notification-service",
      reasons: ["notificationServiceExtension"],
    },
  ],
};
module.exports = config;
