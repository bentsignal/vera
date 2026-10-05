import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * `APP_VARIANT=development` builds "Vera Dev": its own bundle ID, name,
 * scheme, and icon, so it installs next to the TestFlight or App Store app.
 * Every development binary uses it: the simulator and phone dev clients
 * (scripts/sim.sh, scripts/phone.sh) and internal builds (eas.json). Only
 * store builds are Vera. See apps/mobile/README.md.
 */
const dev = process.env.APP_VARIANT === "development";

const BUNDLE_ID = dev ? "chat.vera.app.dev" : "chat.vera.app";
const NOTIFICATION_SERVICE_BUNDLE_ID = `${BUNDLE_ID}.NotificationService`;

/**
 * Builds the iOS Notification Service Extension that shows message pushes
 * as communication notifications (sender photo, sender title). Off until
 * the extension has signing credentials; see README.md.
 */
const notificationExtension = process.env.VERA_NOTIFICATION_EXTENSION === "1";

const EAS_PROJECT_ID = "5680db13-57a8-4b74-ae41-1f52abbda0b1";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: dev ? "Vera Dev" : "Vera",
  slug: "vera",
  owner: "directedbyshawn",
  scheme: dev ? "vera-dev" : "vera",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  userInterfaceStyle: "automatic",
  platforms: ["ios", "android"],
  // Over-the-air updates (EAS Update) reach only binaries whose native code
  // matches: the fingerprint changes whenever native code or config does.
  // Each build profile has its own channel; see eas.json and docs/releasing.md.
  runtimeVersion: { policy: "fingerprint" },
  updates: {
    url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    checkAutomatically: "ON_LOAD",
    fallbackToCacheTimeout: 0,
  },
  ios: {
    // Liquid Glass icon from Icon Composer; see assets/icons/README.md.
    icon: dev ? "./assets/icons/vera-dev.icon" : "./assets/icons/vera.icon",
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: true,
    // Passkeys use the permanent relying party ID `vera.chat`, which also
    // hosts space invite links (`/join/*`, Vera Dev's `/dev/join/*`).
    associatedDomains: ["webcredentials:vera.chat", "applinks:vera.chat"],
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundImage: dev
        ? "./assets/icons/vera-dev-android-background.png"
        : "./assets/icons/vera-android-background.png",
      foregroundImage: dev
        ? "./assets/icons/vera-dev-android-foreground.png"
        : "./assets/icons/vera-android-foreground.png",
      monochromeImage: "./assets/icons/vera-android-monochrome.png",
    },
    predictiveBackGestureEnabled: true,
    // Space invite links open in the app (verified by vera.chat's
    // assetlinks.json); Vera Dev claims only its own `/dev/join/` links.
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: [
          {
            host: "vera.chat",
            pathPrefix: dev ? "/dev/join/" : "/join/",
            scheme: "https",
          },
        ],
      },
    ],
    // Firebase project vera-c5690: Expo push reaches Android through FCM.
    // Public client identifiers only; the FCM V1 service account key lives
    // in EAS credentials, not here (see docs/android.md). Vera Dev is its
    // own Firebase Android app.
    googleServicesFile: dev
      ? "./google-services.dev.json"
      : "./google-services.json",
  },
  plugins: [
    // Adopts the UIScene life cycle the iOS 27 SDK requires; remove with SDK 58.
    "./plugins/with-ios-scene-lifecycle.cjs",
    "expo-router",
    [
      "expo-image-picker",
      {
        cameraPermission: "Vera uses the camera to send photos and videos.",
        microphonePermission: "Vera uses the microphone to record videos.",
        photosPermission: "Vera uses your photos to send them in messages.",
      },
    ],
    [
      "expo-notifications",
      {
        // Android's notification small icon: white leaves it tints with
        // `color`. iOS badges notifications with the app icon instead.
        icon: "./assets/icons/vera-android-notification.png",
        color: "#007AFF",
      },
    ],
    "expo-secure-store",
    "expo-video",
    [
      "expo-splash-screen",
      {
        // No logo: the app starts fast enough that one only flickers. The
        // colors match the app background, which fades in over them.
        backgroundColor: "#FFFFFF",
        dark: { backgroundColor: "#000000" },
        // Android's splash API always draws an icon slot; a transparent
        // image keeps it blank (with no image the build fails).
        android: { image: "./assets/images/splash-android-blank.png" },
      },
    ],
    [
      "./plugins/with-notification-service.cjs",
      {
        bundleIdentifier: NOTIFICATION_SERVICE_BUNDLE_ID,
        enabled: notificationExtension,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: EAS_PROJECT_ID,
      ...(notificationExtension
        ? {
            // Tells EAS to sign the extension target as well.
            build: {
              experimental: {
                ios: {
                  appExtensions: [
                    {
                      bundleIdentifier: NOTIFICATION_SERVICE_BUNDLE_ID,
                      entitlements: {},
                      targetName: "NotificationService",
                    },
                  ],
                },
              },
            },
          }
        : {}),
    },
  },
});
