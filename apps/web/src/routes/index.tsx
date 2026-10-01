import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import type { HomePds } from "../features/pds/model.ts";
import { AccountEntry } from "../features/account/AccountEntry.tsx";
import { AccountSession } from "../features/account/AccountSession.tsx";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [selection, setSelection] = useState<{
    home: HomePds;
    username: string;
  }>();
  if (selection !== undefined) {
    return (
      <AccountSession
        home={selection.home}
        initialUsername={selection.username}
        onBack={() => setSelection(undefined)}
      />
    );
  }

  return <AccountEntry onSelect={setSelection} />;
}
