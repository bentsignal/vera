import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import type { HomeServer } from "../live/config.ts";
import { HomeServerSession } from "../cloud/HomeServerSession.tsx";
import { homes } from "../live/config.ts";
import { ServerPicker } from "../server-picker/ServerPicker.tsx";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [home, setHome] = useState<HomeServer>();
  if (home !== undefined) {
    return (
      <HomeServerSession
        home={home}
        onChooseServer={() => setHome(undefined)}
      />
    );
  }

  return <ServerPicker homes={homes} onChoose={setHome} />;
}
