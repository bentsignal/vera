// Native fingerprint (the runtime version over-the-air updates match on).
// eas.json only affects native builds through env such as
// VERA_NOTIFICATION_EXTENSION, which already reaches the hashed app config,
// so editing build profiles must not cut installed binaries off from updates.
/** @type {import('expo/fingerprint').Config} */
const config = {
  ignorePaths: ["eas.json"],
};
module.exports = config;
