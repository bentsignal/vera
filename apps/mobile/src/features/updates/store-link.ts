import { Platform } from "react-native";

/** Where to get a new binary when no over-the-air update can fix this one. */
export const STORE_URL =
  Platform.OS === "ios"
    ? // Opens Vera in TestFlight, where every tester gets builds today.
      "itms-beta://beta.itunes.apple.com/v1/app/6818656155"
    : "https://play.google.com/store/apps/details?id=chat.vera.app";

/** The button that opens `STORE_URL`. */
export const STORE_LABEL =
  Platform.OS === "ios" ? "Open TestFlight" : "Open Play Store";
