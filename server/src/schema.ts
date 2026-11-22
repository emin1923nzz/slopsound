import { pgTable, uuid, text, timestamp, index, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import type { ChatAttachment } from "./attachments.js";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull().default(""),
  passwordHash: text("password_hash"),
  googleSub: text("google_sub"),
  groqApiKey: text("groq_api_key").notNull().default(""),
  totpSecret: text("totp_secret").notNull().default(""),
  totpEnabled: integer("totp_enabled").notNull().default(0),
  youtubeUrl: text("youtube_url").notNull().default(""),
  spotifyUrl: text("spotify_url").notNull().default(""),
  steamUrl: text("steam_url").notNull().default(""),
  robloxUrl: text("roblox_url").notNull().default(""),
  appleMusicUrl: text("apple_music_url").notNull().default(""),
  avatarColor: text("avatar_color").notNull().default("#8B6CFF"),
  tag: text("tag").notNull().default("0000"),
  title: text("title").notNull().default(""),
  customStatus: text("custom_status").notNull().default("SlopSound tasarlıyor"),
  bio: text("bio").notNull().default("SlopSound kullanıcısı."),
  avatarUrl: text("avatar_url").notNull().default(""),
  bannerUrl: text("banner_url").notNull().default(""),
  activity: text("activity").notNull().default(""),
  status: text("status").notNull().default("online"),
  bot: integer("bot").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("users_google_sub_idx").on(table.googleSub)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("sessions_token_hash_idx").on(table.tokenHash)]);

export const servers = pgTable("servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#8B6CFF"),
  iconUrl: text("icon_url").notNull().default(""),
  isPublic: integer("is_public").notNull().default(0),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const serverMembers = pgTable("server_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  serverId: uuid("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("server_members_server_user_idx").on(table.serverId, table.userId),
  index("server_members_user_idx").on(table.userId),
]);

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  serverId: uuid("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  maxUses: integer("max_uses").notNull().default(10),
  uses: integer("uses").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("invites_code_idx").on(table.code)]);

export const channels = pgTable("channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  serverId: uuid("server_id").references(() => servers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("text"),
  description: text("description").notNull().default(""),
  groupLabel: text("group_label").notNull().default("Kanallar"),
  position: integer("position").notNull().default(0),
}, (table) => [index("channels_server_position_idx").on(table.serverId, table.position)]);

export const channelMembers = pgTable("channel_members", {
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (table) => [uniqueIndex("channel_members_channel_user_idx").on(table.channelId, table.userId)]);

export const friends = pgTable("friends", {
  id: uuid("id").primaryKey().defaultRandom(),
  requesterId: uuid("requester_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  addresseeId: uuid("addressee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("friends_pair_idx").on(table.requesterId, table.addresseeId),
  index("friends_addressee_idx").on(table.addresseeId, table.status),
]);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  audioUrl: text("audio_url"),
  duration: text("duration"),
  reactions: jsonb("reactions").$type<{ emoji: string; count: number }[]>().notNull().default([]),
  attachments: jsonb("attachments").$type<ChatAttachment[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("messages_channel_created_idx").on(table.channelId, table.createdAt)]);

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: uuid("reporter_id").notNull().references(() => users.id),
  reportedUserId: uuid("reported_user_id").references(() => users.id),
  messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }),
  serverId: uuid("server_id").references(() => servers.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("reports_status_idx").on(table.status)]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  serverId: uuid("server_id").references(() => servers.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_logs_server_created_idx").on(table.serverId, table.createdAt)]);
