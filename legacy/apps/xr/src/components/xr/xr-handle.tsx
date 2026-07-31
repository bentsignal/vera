import { Container } from "@react-three/uikit";

import { hexColors, xrStyles } from "~/styles/styles";

export function XRHandle({
  show,
  width = 150,
}: {
  show: boolean;
  width?: number;
}) {
  return (
    <Container
      display="flex"
      justifyContent="center"
      alignItems="center"
      marginBottom={xrStyles.spacing3xl}
    >
      <Container
        backgroundColor={hexColors.foreground}
        width={width}
        height={xrStyles.sizeSm}
        borderRadius={xrStyles.radiusSm}
        opacity={show ? 1 : 0}
      />
    </Container>
  );
}
