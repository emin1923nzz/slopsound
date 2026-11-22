ALTER TABLE "servers" DROP CONSTRAINT "servers_owner_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "servers" ALTER COLUMN "color" SET DEFAULT '#8B6CFF';--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "icon_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;