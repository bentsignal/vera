import { useEffect } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";

import { threadQueries } from "@acme/features/thread";

export function ThreadTitleUpdater({ threadId }: { threadId: string }) {
  const { data: title } = useSuspenseQuery({
    ...threadQueries.title(threadId),
    select: (data) => data ?? "",
  });

  // eslint-disable-next-line no-restricted-syntax -- Syncs document.title with query data (external DOM API)
  useEffect(() => {
    if (title) {
      document.title = title;
    }
  }, [title]);

  return null;
}
