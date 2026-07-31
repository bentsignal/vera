import { Container, Text } from "@react-three/uikit";
import { Button } from "@react-three/uikit-default";
import { SquarePen } from "@react-three/uikit-lucide";

import { useThreadList, useThreadStore } from "@acme/features/thread";

import { XRCustomContainer as CustomContainer } from "~/components/xr/xr-custom-container";
import { XRGrabbable as Grabbable } from "~/components/xr/xr-grabbable";
import { XRHandle } from "~/components/xr/xr-handle";
import { TextElement } from "~/components/xr/xr-text";
import { hexColors, xrStyles } from "~/styles/styles";
import { XRThreadListItem as ThreadListItem } from "./xr-thread-list-item";

function NewThreadButton() {
  const setActiveThread = useThreadStore((state) => state.setActiveThread);
  const setMainThread = useThreadStore((state) => state.setMainThread);
  return (
    <Button
      padding={xrStyles.spacingMd}
      borderRadius={xrStyles.radiusLg}
      flexDirection="row"
      alignItems="center"
      gap={xrStyles.spacingMd}
      onClick={() => {
        setActiveThread(null);
        setMainThread(null);
      }}
    >
      <SquarePen
        width={xrStyles.textMd}
        height={xrStyles.textMd}
        color={hexColors.card}
      />
      <Text color={hexColors.card}>New Thread</Text>
    </Button>
  );
}

export function XRThreadList() {
  const { threads, status, loadMoreThreads } = useThreadList();
  return (
    <group rotation={[0, 0.4, 0]} position={[-0.4, 0.3, 0.08]}>
      <Grabbable>
        <CustomContainer header={<NewThreadButton />}>
          {threads.length === 0 && status !== "LoadingFirstPage" && (
            <Container flexShrink={0}>
              <Text color={hexColors.foreground}>No threads found</Text>
            </Container>
          )}
          <Container
            marginBottom={xrStyles.spacingLg}
            flexDirection="column"
            flexShrink={0}
            gap={xrStyles.spacingSm}
          >
            {threads.map((item) => (
              <ThreadListItem
                key={item.id}
                thread={{
                  ...item,
                  active: false,
                  pinned: item.pinned,
                  latestEvent: item.latestEvent,
                }}
              />
            ))}
          </Container>
          {status !== "Exhausted" && status !== "LoadingFirstPage" && (
            <Button onClick={loadMoreThreads} borderRadius={xrStyles.radiusLg}>
              <TextElement color={hexColors.card} textAlign="center">
                Load More
              </TextElement>
            </Button>
          )}
        </CustomContainer>
        <XRHandle show={true} />
      </Grabbable>
    </group>
  );
}
