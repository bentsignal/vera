import { useId, useRef, useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { DevHold } from "./dev-menu-layout";
import type { ListEvent, MessageListViewMethods } from "./native";
import { COMPOSER_GAP } from "./composer-binding";
import { ComposerLayout } from "./composer-layout";
import { devRows } from "./dev-fixtures";
import { DevMenu } from "./dev-menu";
import { devLift } from "./dev-menu-layout";
import { FIXTURE_BEHAVIOR, FIXTURE_THEME } from "./fixtures";
import { useMenuKeyboardHold } from "./menu-keyboard-hold";
import { MessageListView, nativeSupport } from "./native";

/**
 * `/dev-native-list?composer=1`: local pairs through a real Modal. No sends,
 * native timers or worker hooks. Native traces decide before/after-worker order.
 */
function useDevComposerPair() {
  const owner = useId();
  const list = useRef<MessageListViewMethods>(null);
  const safe = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const keyboard = useMenuKeyboardHold();
  const [pair, setPair] = useState(() => ({
    height: 160,
    release: 0,
    rows: devRows(60, 0, "bubbles"),
  }));
  const [layout, setLayout] = useState<"bubbles" | "stacked">("bubbles");
  const [held, setHeld] = useState<DevHold>();
  const [lifting, setLifting] = useState(false);
  const [status, setStatus] = useState("Focus input, then hold a row");
  // The declarative lift=null requests close in native commit before this
  // pair's worker submission. Its Promise waiter is attached after bar layout.
  const beforeWorker = useRef(false);
  const waiter = useRef<(() => void) | undefined>(undefined);

  function land() {
    return list.current?.landLift?.() ?? Promise.resolve();
  }
  function releasePair(close: boolean) {
    beforeWorker.current = close;
    setPair((now) => ({
      height: now.height === 160 ? 96 : 160,
      release: now.release + 1,
      rows: now.rows.map((row, index) =>
        index === 0 && row.kind === "message"
          ? {
              ...row,
              accessibilityLabel: `Pair ${now.release + 1}`,
              arrived: false,
            }
          : row,
      ),
    }));
    setStatus(close ? "Close queued with pair" : "Pair released while frozen");
  }
  function closing() {
    keyboard.menuKeyboard.onClosing();
    setLifting(false);
    if (!beforeWorker.current) return land();
    return new Promise<void>((resolve) => {
      waiter.current = resolve;
    });
  }
  function barLaidOut() {
    if (!beforeWorker.current || waiter.current === undefined) return;
    beforeWorker.current = false;
    const resolve = waiter.current;
    waiter.current = undefined;
    void land().then(resolve, resolve);
  }
  function onEvent({ nativeEvent: event }: { nativeEvent: ListEvent }) {
    if (event.type !== "hold") return;
    keyboard.hold();
    setHeld({
      ...event,
      card: layout === "stacked" && event.part === "message",
    });
    setLifting(true);
  }
  return {
    owner,
    list,
    safe,
    screen,
    keyboard,
    pair,
    layout,
    held,
    lifting,
    status,
    releasePair,
    closing,
    barLaidOut,
    onEvent,
    changeLayout: () => {
      const next = layout === "bubbles" ? "stacked" : "bubbles";
      setLayout(next);
      setPair((now) => ({ ...now, rows: devRows(60, 0, next) }));
    },
    closed: () => {
      keyboard.menuKeyboard.onClosed(true);
      setHeld(undefined);
      setStatus("Real landing returned; keyboard requested");
    },
  };
}

export function DevComposerLayout() {
  const {
    owner,
    list,
    safe,
    screen,
    keyboard,
    pair,
    layout,
    held,
    lifting,
    status,
    releasePair,
    closing,
    barLaidOut,
    onEvent,
    changeLayout,
    closed,
  } = useDevComposerPair();
  if (
    MessageListView === null ||
    !nativeSupport?.features?.includes("composerLayout")
  ) {
    return <Text>This fixture needs a composerLayout native client.</Text>;
  }
  return (
    <View style={{ flex: 1, backgroundColor: "white" }}>
      <MessageListView
        ref={list}
        style={{ flex: 1 }}
        contractVersion={1}
        rows={pair.rows}
        theme={FIXTURE_THEME}
        behavior={FIXTURE_BEHAVIOR}
        composer={{ owner, release: pair.release, gap: COMPOSER_GAP }}
        insets={{
          top: safe.top + 44,
          bottom: pair.height + COMPOSER_GAP,
          keyboardOverlap: safe.bottom,
        }}
        keyboard
        keyboardFrozen={keyboard.frozen}
        lift={held && lifting ? devLift(held, screen, safe).lift : undefined}
        onEvent={onEvent}
      />
      <Text style={{ position: "absolute", top: safe.top, left: 8 }}>
        {status}
      </Text>
      <KeyboardStickyView
        offset={{ closed: 0, opened: safe.bottom }}
        style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
      >
        <ComposerLayout enabled owner={owner} sequence={pair.release}>
          <View
            testID="dev-composer-bar"
            style={{ height: pair.height, backgroundColor: "#eee" }}
            onLayout={barLaidOut}
          >
            <Pressable onPress={changeLayout}>
              <Text>{layout}</Text>
            </Pressable>
            <TextInput
              accessibilityLabel="Message"
              placeholder="Message"
              style={{ height: 44, backgroundColor: "white" }}
            />
          </View>
        </ComposerLayout>
      </KeyboardStickyView>
      {held && (
        <DevMenu
          hold={held}
          onClosing={closing}
          onClosed={closed}
          controls={(close) => (
            <View style={{ gap: 12, backgroundColor: "white", padding: 12 }}>
              <Pressable onPress={() => releasePair(false)}>
                <Text>Release pair, keep menu</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  releasePair(true);
                  close();
                }}
              >
                <Text>Release pair and close</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}
