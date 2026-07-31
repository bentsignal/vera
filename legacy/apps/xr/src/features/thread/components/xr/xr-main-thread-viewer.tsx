import { useThreadStore } from "@acme/features/thread";

import { XRNewThread } from "./xr-new-thread";
import { XRThread } from "./xr-thread";

export function XRMainThreadViewer() {
  const mainThread = useThreadStore((state) => state.mainThread);
  if (!mainThread) return <XRNewThread />;
  return <XRThread threadId={mainThread.id} isMainThread={true} />;
}
