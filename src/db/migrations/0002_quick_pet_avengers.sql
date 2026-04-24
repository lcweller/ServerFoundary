ALTER TABLE "supported_games" ADD COLUMN "egg_json" jsonb;--> statement-breakpoint
ALTER TABLE "supported_games" ADD COLUMN "available" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "supported_games" ADD COLUMN "protocol" text DEFAULT 'tcp' NOT NULL;