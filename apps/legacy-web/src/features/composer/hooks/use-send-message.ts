import { useNavigate } from "@tanstack/react-router";

import { useSendMessage as useSharedSendMessage } from "@acme/features/composer";

export function useSendMessage() {
  const navigate = useNavigate();
  return useSharedSendMessage({
    navigateToThread: (threadId) => {
      void navigate({ to: `/chat/${threadId}` });
    },
  });
}
