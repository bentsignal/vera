import { createFileRoute } from "@tanstack/react-router";
import { Canvas } from "@react-three/fiber";
import { createXRStore, PointerEvents, XR } from "@react-three/xr";
import { Box } from "lucide-react";

import { Button } from "@acme/ui/button";

import { XRComposer } from "~/features/composer/components/xr/xr-composer";
import { XRMainThreadViewer } from "~/features/thread/components/xr/xr-main-thread-viewer";
import { XRThreadList } from "~/features/thread/components/xr/xr-thread-list";
import { XRThreads } from "~/features/thread/components/xr/xr-threads";
import { cn } from "~/lib/utils";

const store = createXRStore();

export const Route = createFileRoute("/_authenticated/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex h-screen flex-1 flex-col items-center justify-center gap-4">
      <div className="flex w-full items-center justify-center gap-2">
        <Button onClick={() => store.enterAR()}>
          <Box className="h-4 w-4" />
          Enter XR
        </Button>
      </div>
      <Canvas
        className={cn("!absolute inset-0 top-0", "-z-50 opacity-0")}
        style={{ height: "100dvh", touchAction: "none" }}
        gl={{ localClippingEnabled: true }}
      >
        <PointerEvents />
        <XR store={store}>
          <group position={[0, 1, -0.7]}>
            <XRThreadList />
            <XRComposer />
            <XRMainThreadViewer />
            <XRThreads />
          </group>
        </XR>
      </Canvas>
    </div>
  );
}
