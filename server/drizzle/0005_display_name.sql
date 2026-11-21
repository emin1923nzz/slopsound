ALTER TABLE "users" ADD COLUMN "display_name" text DEFAULT '' NOT NULL;
UPDATE "users" SET "display_name" = "username" WHERE "display_name" = '';
