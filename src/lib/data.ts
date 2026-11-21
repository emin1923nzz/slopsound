export type Status = "online" | "idle" | "dnd" | "offline";

export type Member = {
  id: string;
  name: string;
  status: Status;
  activity?: string;
  color?: string;
  role: "Yönetim" | "AI" | "Çevrimiçi" | "Çevrimdışı";
  bot?: boolean;
  badges?: string[];
  avatarUrl?: string;
};

export type Attachment = {
  kind: "image" | "video" | "audio" | "file";
  mime: string;
  name: string;
  url: string;
  bytes: number;
  width?: number;
  height?: number;
};

export type Message = {
  id: string;
  author: string;
  color: string;
  time: string;
  text: string;
  mention?: boolean;
  ai?: boolean;
  own?: boolean;
  badges?: string[];
  reactions?: { emoji: string; count: number }[];
  audioUrl?: string;
  duration?: number;
  attachments?: Attachment[];
  avatarUrl?: string;
};

export type Channel = {
  id: string;
  name: string;
  type: "text" | "voice" | "announcement" | "dm";
  description: string;
  serverId?: string | null;
  unread?: number;
  live?: boolean;
  people?: number;
};

export type ChannelGroup = { label: string; channels: Channel[] };

export type ServerItem = {
  id: string;
  name: string;
  color: string;
};

export type DMItem = {
  id: string;
  peerId: string;
  name: string;
  status: Status;
  preview: string;
  time: string;
  unread: number;
  ai?: boolean;
  group?: boolean;
  avatarUrl?: string;
};

export type FriendRequest = {
  id: string;
  name: string;
  source: string;
  mutual: string;
  time: string;
};

export type ActivityPoint = { day: string; messages: number; voice: number };

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarColor: string;
  tag: string;
  title: string;
  customStatus: string;
  bio: string;
  avatarUrl: string;
  bannerUrl: string;
  activity: string;
  status: Status;
  bot: boolean;
  createdAt: string;
  badges: string[];
};

export type Bootstrap = {
  user: AuthUser;
  servers: ServerItem[];
  channelGroups: ChannelGroup[];
  dms: DMItem[];
  members: Member[];
  friendRequests: FriendRequest[];
  activity: ActivityPoint[];
};
