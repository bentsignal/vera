import type { ConfigContext, ExpoConfig } from "expo/config";

const NOTIFICATION_SERVICE_BUNDLE_ID = "chat.vera.app.NotificationService";

/**
 * Builds the iOS Notification Service Extension that shows message pushes
 * as communication notifications (sender photo, sender title). Off until
 * the extension has signing credentials; see README.md.
 */
const notificationExtension = process.env.VERA_NOTIFICATION_EXTENSION === "1";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Vera",
  slug: "vera",
  owner: "directedbyshawn",
  scheme: "vera",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  userInterfaceStyle: "automatic",
  platforms: ["ios", "android"],
  ios: {
    // Liquid Glass icon from Icon Composer; see assets/icons/README.md.
    icon: "./assets/icons/vera.icon",
    bundleIdentifier: "chat.vera.app",
    supportsTablet: true,
    // Passkeys use the permanent relying party ID `vera.chat`.
    associatedDomains: ["webcredentials:vera.chat"],
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: "chat.vera.app",
    adaptiveIcon: {
      backgroundImage: "./assets/icons/vera-android-background.png",
      foregroundImage: "./assets/icons/vera-android-foreground.png",
      monochromeImage: "./assets/icons/vera-android-monochrome.png",
    },
    predictiveBackGestureEnabled: true,
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
    ["expo-notifications", { color: "#007AFF" }],
    "expo-secure-store",
    "expo-video",
    [
      "expo-splash-screen",
      {
        // No logo: the app starts fast enough that one only flickers. The
        // colors match the app background, which fades in over them.
        backgroundColor: "#FFFFFF",
        dark: { backgroundColor: "#000000" },
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
      projectId: "5680db13-57a8-4b74-ae41-1f52abbda0b1",
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
