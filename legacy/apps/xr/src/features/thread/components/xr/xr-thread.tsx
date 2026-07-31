import { useState } from "react";
import { Container } from "@react-three/uikit";
import { Maximize2, Minimize2, X } from "@react-three/uikit-lucide";

import { useMessageStore } from "@acme/features/messages";
import { useThreadStore } from "@acme/features/thread";

import { XRCustomContainer as CustomContainer } from "~/components/xr/xr-custom-container";
import { XRGrabbable as Grabbable } from "~/components/xr/xr-grabbable";
import { XRHandle } from "~/components/xr/xr-handle";
import { XRMessages as Messages } from "~/features/messages/components/xr/xr-messages";
import { useXRThreadScroll } from "~/features/thread/hooks/use-xr-thread-scroll";
import { hexColors, xrStyles } from "~/styles/styles";

export function XRThread({
  threadId,
  offset,
  isMainThread,
}: {
  threadId: string;
  offset?: number;
  isMainThread?: boolean;
}) {
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const { ref } = useXRThreadScroll({ messagesLoaded });

  const isActiveThread = useThreadStore(
    (state) => state.activeThread && state.activeThread === threadId,
  );
  const setActiveThread = useThreadStore((state) => state.setActiveThread);

  const [expanded, setExpanded] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  return (
    <group position={[isMainThread && expanded ? 0.1 : 0, 0.31, offset ?? 0]}>
      <Grabbable>
        <Container
          flexDirection="column"
          gap={xrStyles.spacingMd}
          onHoverChange={(hovering) => setIsHovering(hovering)}
        >
          <ThreadControls
            threadId={threadId}
            expanded={expanded}
            toggleExpanded={() => setExpanded(!expanded)}
            isHovering={isHovering}
            isMainThread={isMainThread}
          />
          <CustomContainer
            key={`${threadId}-${expanded}`}
            alignItems="center"
            justifyContent="flex-start"
            gap={xrStyles.spacing3xl}
            scrollRef={ref}
            backgroundColor={hexColors.card}
            width={expanded ? xrStyles.containerLg : xrStyles.containerMd}
            height={expanded ? xrStyles.container2xl : xrStyles.containerLg}
            borderColor={isActiveThread ? hexColors.primary : hexColors.card}
            borderWidth={2}
            onClick={() => setActiveThread(threadId)}
          >
            <Messages
              threadId={threadId}
              triggerMessagesLoaded={() => setMessagesLoaded(true)}
            />
            <Bumper />
          </CustomContainer>
          <XRHandle show={true} />
        </Container>
      </Grabbable>
    </group>
  );
}

function Bumper() {
  const numMessagesSent = useMessageStore((state) => state.numMessagesSent);
  const [initialLength] = useState(() => numMessagesSent);
  const hasNewMessages = numMessagesSent != initialLength;
  return <Container width="100%" height={hasNewMessages ? 100 : 30} />;
}

function ThreadControls({
  threadId,
  expanded,
  toggleExpanded,
  isHovering,
  isMainThread,
}: {
  threadId: string;
  expanded: boolean;
  toggleExpanded: () => void;
  isHovering: boolean;
  isMainThread?: boolean;
}) {
  const removeXrThread = useThreadStore((state) => state.removeXrThread);
  const iconStyles = {
    width: xrStyles.textMd,
    height: xrStyles.textMd,
    color: hexColors.primary,
    padding: xrStyles.spacingSm,
    borderRadius: xrStyles.radiusLg,
    opacity: isHovering ? 1 : 0,
    hover: {
      backgroundColor: hexColors.card,
    },
  };
  return (
    <Container
      alignItems="center"
      justifyContent="flex-end"
      gap={xrStyles.spacingSm}
    >
      {expanded ? (
        <Minimize2 {...iconStyles} onClick={toggleExpanded} />
      ) : (
        <Maximize2 {...iconStyles} onClick={toggleExpanded} />
      )}
      {!isMainThread && (
        <X {...iconStyles} onClick={() => removeXrThread(threadId)} />
      )}
    </Container>
  );
}
