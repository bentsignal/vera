import type Animated from "react-native-reanimated";
import { useRef, useState } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { Stack, useRouter } from "expo-router";
import Add from "@expo/material-symbols/add.xml";
import EditSquare from "@expo/material-symbols/edit_square.xml";
import { useCSSVariable } from "uniwind";

import { PreloadIcons } from "~/components/preload-icons";
import { HomeMenu } from "~/features/home/home-menu";
import { HomePager, PagerPage } from "~/features/home/home-pager";
import { HomeTabs } from "~/features/home/home-tabs";
import { HOME_PAGES } from "~/features/home/pages";
import { InboxList } from "~/features/inbox/inbox-list";
import { useInboxOnScreen } from "~/features/notifications/push";
import { HomePill } from "~/features/saved/offline-pill";
import { SpacesList } from "~/features/spaces/spaces-list";
import { lightImpact } from "~/lib/native-extras";

/**
 * Home: the Inbox and Spaces side by side, swiped between (or picked from
 * the tabs in the header). One button on each side keeps the tabs
 * centered: the options menu (`HomeMenu`) on the left, and compose or New
 * Space on the right, by page.
 */
export default function HomeScreen() {
  const router = useRouter();
  const background = useCSSVariable("--color-background");
  const { width } = useWindowDimensions();
  const pagerRef = useRef<Animated.ScrollView>(null);
  const position = useSharedValue(0);
  const [page, setPage] = useState(0);
  const current = HOME_PAGES[page]?.key ?? "inbox";
  const isInbox = current === "inbox";
  useInboxOnScreen(isInbox);

  function changePage(index: number) {
    setPage(index);
    lightImpact();
  }

  function select(index: number) {
    pagerRef.current?.scrollTo({ animated: true, x: index * width });
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerLargeTitleEnabled: false,
          // A solid bar with a hairline under the tabs: the glass bar's
          // blur only tracks a list it can find, and the pager hides them.
          headerShadowVisible: true,
          headerStyle: {
            backgroundColor:
              typeof background === "string" ? background : undefined,
          },
          headerTitle: () => (
            <HomeTabs page={page} position={position} onSelect={select} />
          ),
          headerTitleAlign: "center",
          headerTransparent: false,
          title: HOME_PAGES[page]?.label ?? "Home",
        }}
      />
      <HomeMenu page={current} />
      {/* One button whose look and action follow the page, so it never
          changes size or remounts mid-swipe. */}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={
            Platform.OS === "ios"
              ? isInbox
                ? "square.and.pencil"
                : "plus"
              : isInbox
                ? EditSquare
                : Add
          }
          accessibilityLabel={isInbox ? "New message" : "New space"}
          onPress={() => router.push(isInbox ? "/new-message" : "/new-space")}
        />
      </Stack.Toolbar>
      {/* The Spaces page's icon, which only shows once it's swiped to. */}
      <PreloadIcons icons={{ add: Add }} />
      <HomePager
        pagerRef={pagerRef}
        position={position}
        onPageChange={changePage}
      >
        <PagerPage>
          <InboxList />
        </PagerPage>
        <PagerPage>
          <SpacesList />
        </PagerPage>
      </HomePager>
      <HomePill top={8} />
    </>
  );
}
