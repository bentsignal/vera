import Animated, { FadeIn } from "react-native-reanimated";
import { Stack, useRouter } from "expo-router";
import { FieldGroup, Text } from "@expo/ui";

import type {
  AlertDefault,
  NotificationKind,
} from "~/features/settings/notification-settings";
import { FieldList } from "~/components/field-list";
import { ListItem } from "~/components/list-item";
import { NativeHost } from "~/components/native-host";
import { OptimisticChoice } from "~/components/optimistic-choice";
import { OptimisticSwitch } from "~/components/optimistic-switch";
import { SymbolIcon } from "~/components/symbol-icon";
import { ALERT_CHOICES } from "~/features/messaging/alerts";
import { useNotificationSettings } from "~/features/settings/notification-settings";
import { secondaryTextStyle } from "~/lib/colors";

const KINDS = [
  { kind: "directMessages", label: "Direct Messages" },
  { kind: "replies", label: "Replies to Your Messages" },
  { kind: "threadReplies", label: "Thread Updates" },
  { kind: "reactions", label: "Reactions" },
  { kind: "invites", label: "Space Invites" },
] as const satisfies readonly { kind: NotificationKind; label: string }[];

const DEFAULTS = [
  { kind: "groupAlerts", label: "Group Chats", on: "groups" },
  { kind: "channelAlerts", label: "Space Channels", on: "channels" },
] as const satisfies readonly {
  kind: AlertDefault;
  label: string;
  on: NotificationKind;
}[];

/**
 * Which kinds of notifications you get, or none at all, the words that
 * alert you (your name, your keywords), and what groups and channels
 * alert you about unless they say otherwise.
 */
export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { settings, set, setDefault } = useNotificationSettings();
  return (
    <>
      <Stack.Screen options={{ headerLargeTitleEnabled: false }} />
      <Stack.Title>Notifications</Stack.Title>
      {settings === null && (
        <Animated.View entering={FadeIn.duration(220)} style={{ flex: 1 }}>
          <NativeHost style={{ flex: 1 }}>
            <FieldList>
              <FieldGroup.Section>
                <FieldGroup.SectionFooter>
                  <Text>
                    Your account's server doesn't have notification settings
                    yet.
                  </Text>
                </FieldGroup.SectionFooter>
              </FieldGroup.Section>
            </FieldList>
          </NativeHost>
        </Animated.View>
      )}
      {settings != null && (
        <Animated.View entering={FadeIn.duration(220)} style={{ flex: 1 }}>
          <NativeHost style={{ flex: 1 }}>
            <FieldList>
              <FieldGroup.Section>
                <OptimisticSwitch
                  label="Allow Notifications"
                  value={settings.enabled}
                  onChange={(on) => set("enabled", on)}
                />
              </FieldGroup.Section>
              {settings.enabled && (
                <FieldGroup.Section title="Notify Me About">
                  {KINDS.map(({ kind, label }) => (
                    <OptimisticSwitch
                      key={kind}
                      label={label}
                      // Servers from before threads leave replies out:
                      // they're on.
                      value={settings[kind] ?? true}
                      onChange={(on) => set(kind, on)}
                    />
                  ))}
                </FieldGroup.Section>
              )}
              {/* Servers from before these leave keywords out. */}
              {settings.enabled && settings.keywords !== undefined && (
                <FieldGroup.Section title="Notify Me About Messages That Say">
                  <OptimisticSwitch
                    label="My Name"
                    value={settings.yourName ?? true}
                    onChange={(on) => set("yourName", on)}
                  />
                  <ListItem
                    trailing={
                      <SymbolIcon
                        name={{
                          android: "chevron_right",
                          ios: "chevron.right",
                        }}
                        size={14}
                        weight="semibold"
                        tintColorClassName="accent-subtle"
                      />
                    }
                    supportingText={
                      settings.keywords.length === 0 ? undefined : (
                        <Text textStyle={secondaryTextStyle}>
                          {settings.keywords.join(", ")}
                        </Text>
                      )
                    }
                    onPress={() => router.push("/more/keywords")}
                  >
                    Keywords
                  </ListItem>
                </FieldGroup.Section>
              )}
              <FieldGroup.Section title="Groups and Channels">
                {DEFAULTS.map(({ kind, label, on }) => (
                  <OptimisticChoice
                    key={kind}
                    label={label}
                    value={settings[kind] ?? (settings[on] ? "all" : "none")}
                    choices={ALERT_CHOICES}
                    onChange={(level) => setDefault(kind, level)}
                  />
                ))}
              </FieldGroup.Section>
            </FieldList>
          </NativeHost>
        </Animated.View>
      )}
    </>
  );
}
