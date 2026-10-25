// Mocks for native modules the conversation renders with.
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access -- Jest's mock factories require() what they use, untyped. */
require("react-native-gesture-handler/jestSetup");

// Uniwind has no stylesheet here, so it warns about every themed color on
// every render; that's noise, and printing it slows the measurements.
const warn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].startsWith("Uniwind")) return;
  warn(...args);
};

jest.mock("react-native-keyboard-controller", () =>
  require("react-native-keyboard-controller/jest"),
);
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);

// Native views, drawn as plain views: what's measured is React's work.
jest.mock("expo-glass-effect", () => {
  const { View } = require("react-native");
  return { GlassView: View, isLiquidGlassAvailable: () => false };
});
jest.mock("expo-blur", () => {
  const { View } = require("react-native");
  return { BlurView: View };
});
jest.mock("expo-symbols", () => {
  const { View } = require("react-native");
  return { SymbolView: View };
});
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return { Image: Object.assign(View, { prefetch: () => Promise.resolve() }) };
});

// Native modules nothing here calls: just importable.
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
// The device benchmark owns a display-link callback. These tests measure
// row renders, with no UI runtime or scrolling; keep the list's callbacks.
jest.mock("~/features/conversation/dev-fling", () => ({
  useDevFling: (_ref: unknown, callbacks: unknown) => callbacks,
}));
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  downloadAsync: jest.fn(),
  getInfoAsync: jest.fn(),
}));

// Sending and uploading: the list only calls these when you retry.
jest.mock("~/features/messaging/outbox", () => ({
  deleteOutgoing: jest.fn(),
  removeOutgoingItem: jest.fn(),
  retryOutgoing: jest.fn(),
}));

// Signed in as `SELF` (see messages.ts), with every member's profile
// loaded.
jest.mock("~/features/messaging/account", () => ({
  useAccount: () => ({ address: "me@vera.test" }),
}));
jest.mock("~/features/messaging/profiles", () => ({
  useProfiles: () => () => ({ avatarUrl: null, displayName: "Maya" }),
}));
