import { Switch } from "@expo/ui";

import { setNativeList, useNativeListOn } from "./switch";

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
