import { Button } from "@react-three/uikit-default";
import { Send } from "@react-three/uikit-lucide";

import { useComposerStore } from "@acme/features/composer";
import { useThreadStore } from "@acme/features/thread";

import { useSendMessage } from "~/features/composer/hooks/use-send-message";
import { hexColors, xrStyles } from "~/styles/styles";

export function XRComposerSend() {
  const { sendMessage, blockSend, isLoading } = useSendMessage();

  const setActiveThread = useThreadStore((state) => state.setActiveThread);

  return (
    <Button
      onClick={async () => {
        const prompt = useComposerStore.getState().prompt;
        const threadId = await sendMessage({
          customPrompt: prompt,
          navigateToNewThread: false,
        });
        if (threadId) {
          setActiveThread(threadId);
        }
      }}
      disabled={blockSend || isLoading}
      size="icon"
      backgroundColor={hexColors.primary}
      width={40}
      height={32}
      borderRadius={xrStyles.radiusMd}
    >
      <Send
        width={xrStyles.textSm}
        height={xrStyles.textSm}
        color={hexColors.primaryForeground}
      />
    </Button>
  );
}
