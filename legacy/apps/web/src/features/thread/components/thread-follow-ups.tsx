import { useSuspenseQuery } from "@tanstack/react-query";

import { billingQueries } from "@acme/features/billing";
import { threadQueries } from "@acme/features/thread";

import { useSendMessage } from "~/features/composer/hooks/use-send-message";

export function ThreadFollowUps({ threadId }: { threadId: string }) {
  const {
    data: { questions, isEmpty },
  } = useSuspenseQuery({
    ...threadQueries.followUps(threadId),
    select: (data) => ({ questions: data, isEmpty: data.length === 0 }),
  });

  const { sendMessage } = useSendMessage();
  const { data: limitHit } = useSuspenseQuery({
    ...billingQueries.usage(),
    select: (data) => data.limitHit,
  });

  if (limitHit) {
    return null;
  }

  return (
    <div
      className="flex max-w-[500px] flex-col gap-3 transition-opacity duration-1000"
      style={{
        opacity: isEmpty ? 0 : 1,
      }}
    >
      {questions.map((question) => (
        <div
          key={question}
          className="bg-card/50 hover:bg-card/70 rounded-xl p-4 text-sm shadow-md backdrop-blur-sm transition-all duration-300 select-none hover:cursor-pointer"
          onClick={() => {
            void sendMessage({
              customPrompt: question,
              navigateToNewThread: false,
            });
          }}
          role="button"
          aria-label={`Follow up question: ${question}`}
        >
          {question}
        </div>
      ))}
    </div>
  );
}
