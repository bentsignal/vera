import { Handle, HandleTarget } from "@react-three/handle";
import { Container } from "@react-three/uikit";

import { xrStyles } from "~/styles/styles";

export function XRGrabbable({ children }: { children: React.ReactNode }) {
  return (
    <HandleTarget>
      <Handle>
        <Container
          flexDirection="column"
          pixelSize={0.001}
          gap={xrStyles.spacingMd}
        >
          {children}
        </Container>
      </Handle>
    </HandleTarget>
  );
}
