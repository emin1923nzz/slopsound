CREATE TABLE "channel_members" (
	"channel_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"addressee_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channels" ALTER COLUMN "server_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "group_label" text DEFAULT 'Kanallar' NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "reactions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "color" text DEFAULT 'brand' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tag" text DEFAULT '0000' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "custom_status" text DEFAULT 'SlopSound tasarlıyor' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text DEFAULT 'SlopSound kullanıcısı.' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banner_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "activity" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'online' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bot" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_addressee_id_users_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_members_channel_user_idx" ON "channel_members" USING btree ("channel_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friends_pair_idx" ON "friends" USING btree ("requester_id","addressee_id");--> statement-breakpoint
CREATE INDEX "friends_addressee_idx" ON "friends" USING btree ("addressee_id","status");--> statement-breakpoint
CREATE INDEX "channels_server_position_idx" ON "channels" USING btree ("server_id","position");