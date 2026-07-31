import { createFileRoute } from "@tanstack/react-router";

import { threadQueries } from "@acme/features/thread";

import { Composer } from "~/features/composer/composer";
import { Thread } from "~/features/thread/thread";

export const Route = createFileRoute("/_authenticated/chat/$id")({
  component: ChatPage,
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        threadQueries.messagesFirstPage(params.id),
      ),
      context.queryClient.ensureQueryData(threadQueries.state(params.id)),
      context.queryClient.ensureQueryData(threadQueries.title(params.id)),
      context.queryClient.ensureQueryData(threadQueries.followUps(params.id)),
    ]);
  },
});

function ChatPage() {
  const { id } = Route.useParams();

  return (
    <>
      <Thread key={id} threadId={id} />
      <div className="absolute right-0 bottom-0 left-0 z-50">
        <Composer />
      </div>
    </>
  );
}
