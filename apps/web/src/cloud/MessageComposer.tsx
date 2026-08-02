import type { FormEvent } from "react";

interface MessageComposerProps {
  draft: string;
  error?: string;
  sending: boolean;
  setDraft: (draft: string) => void;
  submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

export function MessageComposer({
  draft,
  error,
  sending,
  setDraft,
  submit,
}: MessageComposerProps) {
  return (
    <form className="composer" onSubmit={(event) => void submit(event)}>
      <label>
        <span className="sr-only">Message #general</span>
        <textarea
          maxLength={4_000}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Message #general"
          rows={1}
          value={draft}
        />
      </label>
      <button
        aria-label="Send message"
        disabled={draft.trim().length === 0 || sending}
        type="submit"
      >
        Send
      </button>
      {error === undefined ? null : <p className="composer-error">{error}</p>}
    </form>
  );
}
