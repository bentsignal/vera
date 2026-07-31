import { Container } from "@react-three/uikit";

import { useThreadStore } from "@acme/features/thread";

import { XRCustomContainer as CustomContainer } from "~/components/xr/xr-custom-container";
import { XRGrabbable as Grabbable } from "~/components/xr/xr-grabbable";
import { XRHandle } from "~/components/xr/xr-handle";
import { H2, TextElement } from "~/components/xr/xr-text";
import { hexColors, xrStyles } from "~/styles/styles";

export function XRNewThread() {
  const activeThread = useThreadStore((state) => state.activeThread);
  return (
    <group position={[0, 0.3, 0]}>
      <Grabbable>
        <CustomContainer
          alignItems="center"
          borderColor={
            activeThread === null ? hexColors.primary : hexColors.card
          }
          borderWidth={2}
        >
          <Container
            flexDirection="column"
            flexShrink={0}
            width="100%"
            gap={xrStyles.spacingMd}
            height="100%"
            justifyContent="center"
            alignItems="center"
          >
            <H2 textAlign="center">Welcome back</H2>
            <TextElement textAlign="center">
              How can I help you today?
            </TextElement>
          </Container>
        </CustomContainer>
        <XRHandle show={true} />
      </Grabbable>
    </group>
  );
}
