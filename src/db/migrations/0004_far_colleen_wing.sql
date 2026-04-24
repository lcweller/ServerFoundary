CREATE TABLE "host_metrics_hourly" (
	"host_id" uuid NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"samples" integer NOT NULL,
	"cpu_sum" real NOT NULL,
	"cpu_max" real NOT NULL,
	"mem_pct_sum" real NOT NULL,
	"mem_pct_max" real NOT NULL,
	"disk_used_gb" real,
	"cpu_temp_max" real,
	CONSTRAINT "host_metrics_hourly_host_id_bucket_pk" PRIMARY KEY("host_id","bucket")
);
--> statement-breakpoint
CREATE TABLE "host_metrics_minutely" (
	"host_id" uuid NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"samples" integer NOT NULL,
	"cpu_sum" real NOT NULL,
	"cpu_max" real NOT NULL,
	"mem_pct_sum" real NOT NULL,
	"mem_pct_max" real NOT NULL,
	"disk_used_gb" real,
	"cpu_temp_max" real,
	CONSTRAINT "host_metrics_minutely_host_id_bucket_pk" PRIMARY KEY("host_id","bucket")
);
--> statement-breakpoint
ALTER TABLE "host_metrics_hourly" ADD CONSTRAINT "host_metrics_hourly_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_metrics_minutely" ADD CONSTRAINT "host_metrics_minutely_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;