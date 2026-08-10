import type { FormEvent } from "react";
import { useState } from "react";
import { discoverPds } from "@decentralized-convex/client";

import type { HomeServer } from "../live/config.ts";
import { homeFromDiscovery } from "../live/config.ts";

interface ServerPickerProps {
  onChoose: (home: HomeServer, username: string) => void;
}

export function ServerPicker({ onChoose }: ServerPickerProps) {
  const form = useAddressDiscovery(onChoose);

  return (
    <main className="account-shell">
      <section className="account-panel auth-panel">
        <header className="account-header">
          <span className="app-icon" aria-hidden="true">
            V
          </span>
          <div>
            <h1>Vera</h1>
            <p>Sign in with your address on any compatible PDS.</p>
          </div>
        </header>
        <form onSubmit={(event) => void form.submit(event)}>
          <label>
            Vera address
            <input
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect="off"
              onChange={(event) => form.setAddress(event.target.value)}
              placeholder="username@example.com"
              required
              spellCheck={false}
              type="email"
              value={form.address}
            />
          </label>
          {form.error === undefined ? null : (
            <p className="auth-error">{form.error}</p>
          )}
          <button
            className="primary-button"
            disabled={form.loading}
            type="submit"
          >
            {form.loading ? "Finding your PDS…" : "Continue"}
          </button>
        </form>
      </section>
    </main>
  );
}

function useAddressDiscovery(onChoose: ServerPickerProps["onChoose"]) {
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const normalized = address.trim().toLowerCase();
    const separator = normalized.lastIndexOf("@");
    const username = normalized.slice(0, separator);
    if (separator <= 0 || !/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)) {
      setError("Enter a valid username@domain address.");
      return;
    }

    setLoading(true);
    try {
      const discovery = await discoverPds(normalized);
      onChoose(homeFromDiscovery(discovery), username);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "PDS discovery failed");
    } finally {
      setLoading(false);
    }
  }

  return { address, error, loading, setAddress, submit };
}
