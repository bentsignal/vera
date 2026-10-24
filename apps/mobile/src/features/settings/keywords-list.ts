import { environment } from "@expo/ui/swift-ui/modifiers";

/**
 * For the list `KeywordsSection` is in: editing, so each keyword shows its
 * delete control (a swipe works too).
 */
export const KEYWORDS_LIST_MODIFIERS = [
  environment({ key: "editMode", value: "active" }),
];
