import type { HomeServer } from "../live/config.ts";
import { ChatSidebar } from "./ChatSidebar.tsx";
import { ConversationHeader } from "./ConversationHeader.tsx";
import { MessageComposer } from "./MessageComposer.tsx";
import { MessageList } from "./MessageList.tsx";
import { useChatRoom } from "./use-chat-room.ts";

interface CurrentUser {
  actor: string;
}

interface ChatRoomProps {
  home: HomeServer;
  onChooseServer: () => void;
  onSignOut: () => Promise<unknown>;
  user: CurrentUser;
}

export function ChatRoom(props: ChatRoomProps) {
  const chat = useChatRoom({ home: props.home, user: props.user });

  return (
    <main className="chat-app">
      <ChatSidebar {...props} />
      <section className="conversation-panel">
        <ConversationHeader home={props.home} messages={chat.messages} />
        <MessageList home={props.home} messages={chat.messages} />
        <MessageComposer {...chat.composer} />
      </section>
    </main>
  );
}
