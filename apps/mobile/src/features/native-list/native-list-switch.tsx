import { FieldGroup, Switch } from "@expo/ui";

import { env } from "~/env";
import { useAccounts } from "~/features/messaging/account";
import {
  NATIVE_LIST,
  nativeListInstalled,
  setNativeList,
  useNativeListOn,
} from "./switch";

/** Turns the native message list on or off on this device. */
export function NativeListSwitch() {
  return (
    <Switch
      label="Native Message List"
      value={useNativeListOn()}
      onValueChange={setNativeList}
    />
  );
}

/** Whether a tester (`NATIVE_LIST.testers`) is signed in. */
function useTester() {
  const accounts = useAccounts();
  return (
    NATIVE_LIST.previewBuild ||
    accounts.some((account) => NATIVE_LIST.testers.has(account.address))
  );
}

/**
 * The switch in production builds, for its testers (`NATIVE_LIST.testers`)
 * when one of them is signed in. Dev builds have it in the Developer
 * section.
 */
export function NativeListTesting() {
  const tester = useTester();
  if (env.devTools || !tester) return null;
  return (
    <FieldGroup.Section title="Testing">
      <NativeListSwitch />
    </FieldGroup.Section>
  );
}

/**
 * The switch on a conversation's info page, one tap from the messages, so
 * the two lists can be compared in the same chat: in dev builds and for
 * testers, on a binary that has the native list.
 */
export function ConversationListSection() {
  const tester = useTester();
  if (!nativeListInstalled || (!env.devTools && !tester)) return null;
  return (
    <FieldGroup.Section title="Testing">
      <NativeListSwitch />
    </FieldGroup.Section>
  );
}
