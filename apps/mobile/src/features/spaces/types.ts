export interface Channel {
  id: string;
  name: string;
  topic: string;
  unreadCount: number;
}

export interface Space {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  channels: Channel[];
}
