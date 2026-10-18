import Animated, { FadeIn } from "react-native-reanimated";
import { Stack } from "expo-router";
import { FieldGroup, Text } from "@expo/ui";

import type {
  AlertDefault,
  NotificationKind,
} from "~/features/settings/notification-settings";
import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import { OptimisticChoice } from "~/components/optimistic-choice";
import { OptimisticSwitch } from "~/components/optimistic-switch";
import { ALERT_CHOICES } from "~/features/messaging/alerts";
import { useNotificationSettings } from "~/features/settings/notification-settings";

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
 * Which kinds of notifications you get, or none at all, and what groups
 * and channels alert you about unless they say otherwise.
 */
export default function NotificationSettingsScreen() {
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
