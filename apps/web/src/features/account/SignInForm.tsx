import type { FormEvent } from "react";
import { useState } from "react";

import type { HomeAuthClient } from "../pds/auth.ts";
import type { PdsHome } from "../pds/model.ts";

interface SignInFormProps {
  authClient: HomeAuthClient;
  home: PdsHome;
  initialUsername: string;
  onBack: () => void;
}

export function SignInForm(props: SignInFormProps) {
  const form = useSignInForm(props);
  const isSignUp = form.mode === "sign-up";

  return (
    <main className="account-shell">
      <section className="account-panel auth-panel">
        <button
          className="text-button back-button"
          onClick={props.onBack}
          type="button"
        >
          ← Back
        </button>
        <header className="account-header">
          <span className="app-icon" aria-hidden="true">
            V
          </span>
          <div>
            <h1>{isSignUp ? "Create account" : "Sign in"}</h1>
            <p>{props.home.domain}</p>
          </div>
        </header>
        <form onSubmit={(event) => void form.submit(event)}>
          <label>
            Username
            <span className="address-input">
              <input
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect="off"
                maxLength={32}
                onChange={(event) => form.setUsername(event.target.value)}
                placeholder="username"
                required
                spellCheck={false}
                value={form.username}
              />
              <span>@{props.home.domain}</span>
            </span>
          </label>
          <label>
            Password
            <input
              autoComplete={isSignUp ? "new-password" : "current-password"}
              minLength={8}
              onChange={(event) => form.setPassword(event.target.value)}
              required
              type="password"
              value={form.password}
            />
          </label>
          {form.error === undefined ? null : (
            <p className="auth-error">{form.error}</p>
          )}
          <button
            className="primary-button"
            disabled={form.submitting}
            type="submit"
          >
            {form.submitting
              ? "Please wait…"
              : isSignUp
                ? "Create account"
                : "Sign in"}
          </button>
        </form>
        <button
          className="text-button auth-mode"
          onClick={form.toggleMode}
          type="button"
        >
          {isSignUp
            ? "Already registered here? Sign in"
            : "Need an account? Sign up"}
        </button>
      </section>
    </main>
  );
}

function useSignInForm({ authClient, home, initialUsername }: SignInFormProps) {
  const [error, setError] = useState<string>();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-up");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [username, setUsername] = useState(initialUsername);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(normalized)) {
      setError(
        "Use 2–32 lowercase letters, numbers, dots, dashes, or underscores.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const email = `${normalized}@${home.domain}`;
      const result =
        mode === "sign-up"
          ? await authClient.signUp.email({
              email,
              name: normalized,
              password,
            })
          : await authClient.signIn.email({ email, password });
      if (result.error !== null) {
        setError(result.error.message ?? "Authentication failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return {
    error,
    mode,
    password,
    setPassword,
    setUsername,
    submit,
    submitting,
    toggleMode: () => setMode(mode === "sign-up" ? "sign-in" : "sign-up"),
    username,
  };
}
