ALTER TABLE "game_servers" ADD COLUMN "mem_max_mb" integer DEFAULT 4096 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_servers" ADD COLUMN "cpu_pct" integer DEFAULT 200 NOT NULL;