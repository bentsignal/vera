import { Container } from "@react-three/uikit";

import { XRGrabbable as Grabbable } from "~/components/xr/xr-grabbable";
import { XRHandle } from "~/components/xr/xr-handle";
import { hexColors, xrStyles } from "~/styles/styles";
import { XRComposerInput as ComposerInput } from "./xr-composer-input";
import { XRComposerSend as ComposerSend } from "./xr-composer-send";

// import { ComposerSpeech } from "~/features/speech/components/xr-composer-speech";

export function XRComposer() {
  return (
    <group rotation={[-0.3, 0.3, 0.1]} position={[-0.175, -0.13, 0.2]}>
      <Grabbable>
        <Container
          backgroundColor={hexColors.card}
          flexDirection="row"
          padding={xrStyles.spacingXl}
          alignItems="center"
          justifyContent="space-between"
          borderRadius={xrStyles.radiusLg}
          castShadow
          width={xrStyles.containerLg}
          gap={xrStyles.spacingMd}
        >
          <Container maxHeight={200} overflow="scroll" alignItems="flex-end">
            <ComposerInput />
          </Container>
          {/* <ComposerSpeech /> */}
          <ComposerSend />
        </Container>
        <XRHandle show={true} />
      </Grabbable>
    </group>
  );
}
