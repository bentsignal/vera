import type { Mention } from "@decentralized-convex/messages";
import type { RefObject } from "react";
import type {
  NativeSyntheticEvent,
  TextInput,
  TextInputSelectionChangeEventData,
} from "react-native";
import { useState } from "react";

import type { MentionCandidate } from "./mention-text";
import { readDraft, saveDraftMentions } from "./drafts";
import {
  deleteWholeMention,
  insertMention,
  isPicked,
  keptMentions,
  mentionQuery,
  suggestions,
} from "./mention-text";

interface Selection {
  readonly end: number;
  readonly start: number;
}

/**
 * The message field's @mentions: who's been picked, the people the
 * `@name` being typed at the cursor could be, and picking one. Nobody can
 * be mentioned where `mentionable` is undefined (direct messages). Who's
 * been picked is kept with the draft (`draftKey`).
 */
export function useMentions(
  draft: string,
  mentionable: readonly MentionCandidate[] | undefined,
  draftKey: string,
  input: RefObject<TextInput | null>,
) {
  const [mentions, setPicked] = useState<readonly Mention[]>(
    () => readDraft(draftKey).mentions,
  );
  // Another draft shown in the field (an edit's, or back from one).
  const [shownKey, setShownKey] = useState(draftKey);
  if (shownKey !== draftKey) {
    setShownKey(draftKey);
    setPicked(readDraft(draftKey).mentions);
  }
  function setMentions(next: readonly Mention[]) {
    setPicked(next);
    saveDraftMentions(draftKey, next);
  }
  const [selection, setSelection] = useState<Selection>({ end: 0, start: 0 });
  const query =
    mentionable === undefined || selection.start !== selection.end
      ? null
      : mentionQuery(draft, selection.start);

  /**
   * Puts the cursor at `cursor` once the field has the text changed here.
   * It's moved through the field rather than its `selection` prop, which
   * on iOS leaves a one-line message sitting high in a taller field.
   */
  function place(cursor: number) {
    setSelection({ end: cursor, start: cursor });
    requestAnimationFrame(() => input.current?.setSelection(cursor, cursor));
  }

  return {
    /** Who the `@name` being typed could be; empty when none is. */
    people:
      query === null ||
      mentionable === undefined ||
      isPicked(query.query, mentions)
        ? []
        : suggestions(mentionable, query.query),
    /** For the field: where its cursor is. */
    onSelectionChange: (
      event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
    ) => setSelection(event.nativeEvent.selection),
    /** The text after an edit: deleting into a mention deletes all of it. */
    edited: (text: string) => {
      const whole = deleteWholeMention(draft, text, mentions);
      const next = whole?.text ?? text;
      if (whole !== null) place(whole.cursor);
      setMentions(keptMentions(next, mentions));
      return next;
    },
    /** The text with `person` in place of the `@name` being typed. */
    pick: (person: MentionCandidate) => {
      if (query === null) return null;
      const name = (person.mentionName ?? person.displayName).trim();
      const inserted = insertMention(draft, query.start, selection.start, name);
      setMentions([...mentions, { accountId: person.accountId, name }]);
      place(inserted.cursor);
      return inserted.text;
    },
    /** Who the sent text mentions, starting over for the next message. */
    take: (text: string) => {
      setMentions([]);
      return keptMentions(text, mentions);
    },
  };
}
