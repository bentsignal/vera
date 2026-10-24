import type { TextInputRef } from "@expo/ui";
import { useRef } from "react";
import { Alert, Platform } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Stack } from "expo-router";
import {
  MAX_KEYWORD_LENGTH,
  MAX_KEYWORDS,
} from "@decentralized-convex/messages";
import { FieldGroup } from "@expo/ui";

import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import { TextInput } from "~/components/text-input";
import { KEYWORDS_LIST_MODIFIERS } from "~/features/settings/keywords-list";
import { KeywordsSection } from "~/features/settings/keywords-section";
import { useNotificationSettings } from "~/features/settings/notification-settings";

/**
 * The words that alert you when a message says one: a field to add one,
 * and the list to remove them from.
 */
export default function KeywordsScreen() {
  const { settings, setKeywords } = useNotificationSettings();
  const input = useRef<TextInputRef>(null);
  const keywords = settings?.keywords ?? [];

  function save(next: readonly string[]) {
    setKeywords(next).catch(() =>
      Alert.alert("Couldn't Save Keywords", "Try again in a moment."),
    );
  }

  function add(text: string) {
    const keyword = text.trim().replaceAll(/\s+/g, " ");
    input.current?.clear();
    // iOS ends editing on return; the keyboard stays up for the next one.
    input.current?.focus();
    if (keyword.length === 0) return;
    const key = keyword.toLowerCase();
    if (keywords.some((existing) => existing.toLowerCase() === key)) return;
    if (keywords.length >= MAX_KEYWORDS) {
      Alert.alert(
        "Too Many Keywords",
        `You can have up to ${MAX_KEYWORDS}. Remove one to add another.`,
      );
      return;
    }
    save([keyword, ...keywords]);
  }

  return (
    <>
      <Stack.Screen options={{ headerLargeTitleEnabled: false }} />
      <Stack.Title>Keywords</Stack.Title>
      {settings != null && (
        <Animated.View entering={FadeIn.duration(220)} style={{ flex: 1 }}>
          <NativeHost style={{ flex: 1 }}>
            <FieldList modifiers={KEYWORDS_LIST_MODIFIERS}>
              <FieldGroup.Section>
                <TextInput
                  ref={input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={MAX_KEYWORD_LENGTH}
                  placeholder="Add Keyword"
                  // Android's Done hides the keyboard before `add` runs;
                  // Go does nothing of its own.
                  returnKeyType={Platform.OS === "android" ? "go" : "done"}
                  onSubmitEditing={add}
                />
              </FieldGroup.Section>
              <KeywordsSection
                keywords={keywords}
                onRemove={(removed) => {
                  const gone = new Set(removed);
                  save(keywords.filter((keyword) => !gone.has(keyword)));
                }}
              />
            </FieldList>
          </NativeHost>
        </Animated.View>
      )}
    </>
  );
}
