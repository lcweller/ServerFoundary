CREATE TABLE "backup_configs" (
	"game_server_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"every_hours" integer DEFAULT 24 NOT NULL,
	"retention_count" integer DEFAULT 7 NOT NULL,
	"last_run_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_server_id" uuid NOT NULL,
	"host_id" uuid NOT NULL,
	"user_id" uuid,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"destination" text DEFAULT 'local' NOT NULL,
	"path" text,
	"size_bytes" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"retention_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "backup_configs" ADD CONSTRAINT "backup_configs_game_server_id_game_servers_id_fk" FOREIGN KEY ("game_server_id") REFERENCES "public"."game_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_game_server_id_game_servers_id_fk" FOREIGN KEY ("game_server_id") REFERENCES "public"."game_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;