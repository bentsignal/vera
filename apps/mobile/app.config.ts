import type { ConfigContext, ExpoConfig } from "expo/config";

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
    bundleIdentifier: "chat.vera.app",
    supportsTablet: true,
    // Passkeys use the permanent relying party ID `vera.chat`.
    associatedDomains: ["webcredentials:vera.chat"],
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: "chat.vera.app",
    adaptiveIcon: {
      backgroundColor: "#3B3BD6",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
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
    ["expo-notifications", { color: "#3B3BD6" }],
    "expo-secure-store",
    "expo-video",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 96,
        backgroundColor: "#FFFFFF",
        dark: { backgroundColor: "#000000" },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: { projectId: "5680db13-57a8-4b74-ae41-1f52abbda0b1" },
  },
});
