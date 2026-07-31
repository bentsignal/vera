import type { ContainerProperties, VanillaContainer } from "@react-three/uikit";
import type { Ref } from "react";
import { Container } from "@react-three/uikit";

import { hexColors, xrStyles } from "~/styles/styles";

export function XRCustomContainer({
  children,
  scrollRef,
  gap,
  header,
  ...props
}: {
  children: React.ReactNode;
  scrollRef?: Ref<VanillaContainer>;
  gap?: number;
  header?: React.ReactNode;
} & ContainerProperties) {
  return (
    <Container
      backgroundColor={hexColors.card}
      flexDirection="column"
      padding={xrStyles.spacingXl}
      borderRadius={xrStyles.radiusLg}
      castShadow
      width={xrStyles.containerMd}
      height={500}
      gap={header ? xrStyles.spacingLg : 0}
      {...props}
    >
      {header}
      <Container
        width="100%"
        flexDirection="column"
        gap={gap ?? xrStyles.spacingMd}
        overflow="scroll"
        scrollbarBorderRadius={xrStyles.radiusSm}
        paddingRight={xrStyles.radiusLg}
        ref={scrollRef}
      >
        {children}
      </Container>
    </Container>
  );
}
