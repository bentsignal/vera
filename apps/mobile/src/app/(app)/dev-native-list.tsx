import { useRef, useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MessageListViewMethods } from "~/features/native-list/native";
import { DEV_THEME_DARK } from "~/features/native-list/dev-fixtures";
import { DevMenu } from "~/features/native-list/dev-menu";
import { devLift } from "~/features/native-list/dev-menu-layout";
import { DevCustomRows } from "~/features/native-list/dev-poll";
import {
  FIXTURE_BEHAVIOR,
  FIXTURE_THEME,
} from "~/features/native-list/fixtures";
import {
  CONTRACT_VERSION,
  MessageListView,
  nativeSupport,
} from "~/features/native-list/native";
import { useDevRows } from "~/features/native-list/use-dev-rows";

/**
 * Dev builds: `/dev-native-list` shows the native message list with
 * made-up rows (features/native-list/dev-fixtures.ts), to build and check
 * it on its own: arrivals, older pages, reactions, typing, both layouts,
 * light and dark (it follows the system), the keyboard, and a media-heavy
 * mode for flinging. Taps and holds show in the bar at the top.
 */
export default function DevNativeList() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const list = useRef<MessageListViewMethods>(null);
  const dev = useDevRows();
  const screen = useWindowDimensions();
  const [barHeight, setBarHeight] = useState(100);
  const [bench, setBench] = useState("");

  if (MessageListView === null || nativeSupport === null) {
    return (
      <View className="bg-background flex-1 items-center justify-center">
        <Text className="text-body text-foreground">
          This build has no native message list.
        </Text>
      </View>
    );
  }
  return (
    <View className="bg-background flex-1">
      <MessageListView
        key={dev.key}
        ref={list}
        style={{ flex: 1 }}
        contractVersion={CONTRACT_VERSION}
        rows={dev.rows}
        theme={scheme === "dark" ? DEV_THEME_DARK : FIXTURE_THEME}
        behavior={FIXTURE_BEHAVIOR}
        insets={{ bottom: barHeight, top: insets.top + 44 }}
        keyboard
        liftedRowId={dev.lifted}
        lift={
          dev.held && dev.lifting
            ? devLift(dev.held, screen, insets).lift
            : undefined
        }
        initialRowId={dev.initialRowId}
        alignTop={dev.thread}
        onEvent={dev.onEvent}
      >
        <DevCustomRows rows={dev.rows} />
      </MessageListView>
      <View
        className="bg-background/80 absolute inset-x-0 top-0 gap-1 px-2 pb-1"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-caption text-muted" numberOfLines={2}>
          v{nativeSupport.contractVersion} {dev.rows.length} rows {bench}{" "}
          {dev.last}
        </Text>
      </View>
      <KeyboardStickyView
        offset={{ closed: 0, opened: insets.bottom }}
        style={{ bottom: 0, left: 0, position: "absolute", right: 0 }}
      >
        <View
          className="bg-background/90 gap-2 px-2 pt-2"
          style={{ paddingBottom: insets.bottom }}
          onLayout={(event) => setBarHeight(event.nativeEvent.layout.height)}
        >
          <Controls
            dev={dev}
            onLatest={() => void list.current?.scrollToLatest(true)}
            onBench={() =>
              void list.current
                ?.benchFling?.(5500, 8000)
                .then((result) => setBench(JSON.stringify(result)))
            }
          />
          <TextInput
            className="bg-fill text-body text-foreground rounded-full px-4 py-2"
            placeholder="Message"
            accessibilityLabel="Message"
          />
        </View>
      </KeyboardStickyView>
      {dev.held && (
        <DevMenu
          hold={dev.held}
          onClosing={dev.menuClosing}
          onClosed={dev.menuClosed}
        />
      )}
    </View>
  );
}

function Controls({
  dev,
  onLatest,
  onBench,
}: {
  dev: ReturnType<typeof useDevRows>;
  onLatest: () => void;
  /** A constant-speed fling to the top (contract: `benchFling`). */
  onBench: () => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label={dev.layout}
        onPress={() =>
          dev.reset(dev.layout === "bubbles" ? "stacked" : "bubbles", dev.heavy)
        }
      />
      <Button
        label={dev.heavy ? "heavy" : "mixed"}
        onPress={() => dev.reset(dev.layout, !dev.heavy)}
      />
      <Button label="+1" onPress={() => dev.arrive(1)} />
      <Button label="+20" onPress={() => dev.arrive(20)} />
      <Button label="react" onPress={dev.toggleReaction} />
      <Button label={`typing ${dev.typing}`} onPress={dev.nextTyping} />
      <Button label="typed" onPress={dev.typed} />
      <Button label="latest" onPress={onLatest} />
      <Button label="open m30" onPress={() => dev.openAt("m30")} />
      <Button label="bench" onPress={onBench} />
      <Button
        label={dev.thread ? "thread" : "chat"}
        onPress={dev.toggleThread}
      />
    </View>
  );
}

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      className="bg-fill rounded-full px-3 py-1.5"
      onPress={onPress}
    >
      <Text className="text-footnote text-foreground">{label}</Text>
    </Pressable>
  );
}
