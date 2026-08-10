import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import type { HomeServer } from "../live/config.ts";
import { HomeServerSession } from "../cloud/HomeServerSession.tsx";
import { ServerPicker } from "../server-picker/ServerPicker.tsx";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [selection, setSelection] = useState<{
    home: HomeServer;
    username: string;
  }>();
  if (selection !== undefined) {
    return (
      <HomeServerSession
        home={selection.home}
        initialUsername={selection.username}
        onChooseServer={() => setSelection(undefined)}
      />
    );
  }

  return (
    <ServerPicker
      onChoose={(home, username) => setSelection({ home, username })}
    />
  );
}
