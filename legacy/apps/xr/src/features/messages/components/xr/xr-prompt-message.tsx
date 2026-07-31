import { Text } from "@react-three/uikit";

import type { UIMessage } from "@acme/features/messages";

import { hexColors, xrStyles } from "~/styles/styles";

export function XRPromptMessage({ message }: { message: UIMessage }) {
  return (
    <Text
      key={message.id}
      color={hexColors.foreground}
      flexShrink={0}
      width="100%"
      maxWidth={xrStyles.containerSm}
      marginLeft="auto"
      backgroundColor={hexColors.accent}
      padding={xrStyles.spacingLg}
      borderRadius={xrStyles.radiusLg}
    >
      {message.text}
    </Text>
  );
}
