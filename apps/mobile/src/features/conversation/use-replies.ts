import type { RefObject } from "react";
import { useState } from "react";
import { useRouter } from "expo-router";

import type { ComposerHandle } from "./composer";
import type { Message, ProfileOf, ReplyTarget } from "./types";
import { useAccount } from "~/features/messaging/account";
import { quoteOf } from "~/features/messaging/messages";
import { draftKey, readDraft, saveDraftReply } from "./drafts";
import { quoteText } from "./reply-parts";

/**
 * Replying from a conversation. A tap opens a message's thread, where
 * replies stay. Reply answers a message from the conversation's own field
 * ("Replying to …" over it): the reply shows in the conversation and joins
 * the message's thread (a reply's own, since threads are flat). The reply
 * is kept with the conversation's draft, like its text.
 */
export function useReplies({
  composer,
  conversationId,
  title,
  profileOf,
}: {
  /** The conversation's field, which takes the reply. */
  composer: RefObject<ComposerHandle | null>;
  conversationId: string;
  /** The conversation's name, which the thread shows until it loads. */
  title: string;
  profileOf: ProfileOf;
}) {
  const router = useRouter();
  const { address } = useAccount();
  const key = draftKey(address, conversationId);
  // The message the next one replies to, starting its thread.
  const [replyTo, setReplyTo] = useState(() => readDraft(key).replyTo);

  function replyToTarget(target: ReplyTarget | undefined) {
    saveDraftReply(key, target);
    setReplyTo(target);
  }

  /** Opens a message's thread (a reply's own). */
  function openThread(message: Message) {
    router.push({
      params: {
        account: address,
        conversationId,
        threadId: message.threadId ?? message.id,
        title,
      },
      pathname: "/thread/[threadId]",
    });
  }

  return {
    /** Set while the next message is a reply. */
    replyTo,
    /** What the field shows while replying. */
    replyingTo:
      replyTo === undefined
        ? undefined
        : {
            name: profileOf(replyTo.quote.authorId).displayName,
            text: quoteText(replyTo.quote),
          },
    /** The next message isn't a reply after all (or was just sent). */
    cancel: () => replyToTarget(undefined),
    openThread,
    reply: (message: Message) => {
      replyToTarget({
        id: message.id,
        quote: quoteOf(message),
        threadId: message.threadId,
      });
      composer.current?.focus();
    },
  };
}
