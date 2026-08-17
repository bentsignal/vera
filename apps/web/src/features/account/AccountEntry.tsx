import type { FormEvent } from "react";
import { useState } from "react";
import { discoverPds } from "@decentralized-convex/client";

import type { HomePds } from "../pds/model.ts";

interface AccountEntryProps {
  onSelect: (selection: { home: HomePds; username: string }) => void;
}

export function AccountEntry({ onSelect }: AccountEntryProps) {
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
      const home = await discoverPds(normalized);
      onSelect({ home, username });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "PDS discovery failed");
    } finally {
      setLoading(false);
    }
  }

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
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Vera address
            <input
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect="off"
              onChange={(event) => setAddress(event.target.value)}
              placeholder="username@example.com"
              required
              spellCheck={false}
              type="email"
              value={address}
            />
          </label>
          {error === undefined ? null : <p className="auth-error">{error}</p>}
          <button className="primary-button" disabled={loading} type="submit">
            {loading ? "Finding your PDS…" : "Continue"}
          </button>
        </form>
      </section>
    </main>
  );
}
