import { useSuspenseQuery } from "@tanstack/react-query";

import { billingQueries } from "../../billing/lib/queries";
import { useComposerStore } from "../store/composer-store";

export function useComposerInput() {
  const setPrompt = useComposerStore((state) => state.setPrompt);
  const { data: limitHit } = useSuspenseQuery({
    ...billingQueries.usage(),
    select: (data) => data.limitHit,
  });

  const disabled = useComposerStore(
    (state) => state.storeIsRecording || state.storeIsTranscribing || limitHit,
  );

  const placeholder = "Aa";

  const value = useComposerStore((state) => state.prompt);

  return {
    value,
    setPrompt,
    disabled,
    placeholder,
  };
}
