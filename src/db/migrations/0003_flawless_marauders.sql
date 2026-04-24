CREATE TABLE "tunnels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_server_id" uuid NOT NULL,
	"provider" text DEFAULT 'inproc_tcp_relay' NOT NULL,
	"external_hostname" text,
	"external_port" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tunnels_game_server_id_unique" UNIQUE("game_server_id")
);
--> statement-breakpoint
ALTER TABLE "tunnels" ADD CONSTRAINT "tunnels_game_server_id_game_servers_id_fk" FOREIGN KEY ("game_server_id") REFERENCES "public"."game_servers"("id") ON DELETE cascade ON UPDATE no action;