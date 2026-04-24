import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  real,
  primaryKey,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const hosts = pgTable("hosts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("connecting"),
  ipAddress: text("ip_address"),
  apiKeyHash: text("api_key_hash"),
  metrics: jsonb("metrics"),
  environment: jsonb("environment"),
  agentVersion: text("agent_version"),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const enrollmentTokens = pgTable("enrollment_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  hostId: uuid("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gameServers = pgTable("game_servers", {
  id: uuid("id").defaultRandom().primaryKey(),
  hostId: uuid("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  gameId: text("game_id").notNull(),
  status: text("status").notNull().default("queued"),
  port: integer("port").notNull(),
  playersOnline: integer("players_online").notNull().default(0),
  maxPlayers: integer("max_players").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gameServerLogs = pgTable("game_server_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  gameServerId: uuid("game_server_id")
    .notNull()
    .references(() => gameServers.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  level: text("level").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supportedGames = pgTable("supported_games", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  steamAppId: integer("steam_app_id"),
  defaultPort: integer("default_port").notNull(),
  defaultMaxPlayers: integer("default_max_players").notNull().default(16),
  // Legacy: hand-written shell command for Steam-anon games that don't have
  // an egg yet. Templated with {PORT} / {SERVER_NAME}. Kept as a fallback
  // when `eggJson` is null.
  startupCommand: text("startup_command").notNull(),
  description: text("description"),
  // Subset of the Pterodactyl egg JSON schema. Fields we actually read:
  //   startup:   command template using {{VAR}} placeholders
  //   variables: [{ env_variable, default_value }]
  //   install:   { kind: "paper_jar" | "steamcmd" | "http_download", ... }
  // See src/lib/eggs.ts for the resolver.
  eggJson: jsonb("egg_json"),
  // MVP gate: hide non-anonymous / UDP-only games until the custom relay
  // lands (§2.4, §7.2). We keep rows rather than delete so existing
  // deployments don't orphan.
  available: boolean("available").notNull().default(true),
  protocol: text("protocol").notNull().default("tcp"),
});

/**
 * Tracks the public address a player uses to reach a game server. One
 * row per game_server; the provider column makes room for the eventual
 * WireGuard / VPS relay transport alongside the MVP in-container relay.
 *
 * Specced in PROJECT.md §4. The transport decision lives in
 * /docs/decisions/0001-game-traffic-transport.md.
 */
export const tunnels = pgTable("tunnels", {
  id: uuid("id").defaultRandom().primaryKey(),
  gameServerId: uuid("game_server_id")
    .notNull()
    .unique()
    .references(() => gameServers.id, { onDelete: "cascade" }),
  // "inproc_tcp_relay" (Option A) | "cf_tunnel" | "wireguard_vps" | …
  provider: text("provider").notNull().default("inproc_tcp_relay"),
  // Public hostname a player dials. For the in-container relay this is
  // the dashboard's hostname. For cf_tunnel this is the per-server CNAME.
  externalHostname: text("external_hostname"),
  // Public port at externalHostname. For cf_tunnel this is 443 / null.
  externalPort: integer("external_port"),
  status: text("status").notNull().default("pending"),
  lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Host = typeof hosts.$inferSelect;
export type GameServer = typeof gameServers.$inferSelect;
export type GameServerLog = typeof gameServerLogs.$inferSelect;
export type SupportedGame = typeof supportedGames.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type EnrollmentToken = typeof enrollmentTokens.$inferSelect;
export type Tunnel = typeof tunnels.$inferSelect;

/**
 * Early-access signups collected from the public landing page.
 * PROJECT.md §3.13. Kept separate from `users` so nothing that references
 * `users` has to deal with rows that haven't gone through Supabase Auth.
 */
export const waitlistSignups = pgTable("waitlist_signups", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ip: text("ip"),
  userAgent: text("user_agent"),
});

export type WaitlistSignup = typeof waitlistSignups.$inferSelect;

/**
 * Per-host metrics aggregated in time buckets (PROJECT.md §3.3, §4).
 *
 * Two granularities so the "last hour" view is smooth without paying
 * 60-sample read-amplification on the 30-day view:
 *
 *   host_metrics_minutely — bucket per minute, retained ~3 days
 *   host_metrics_hourly   — bucket per hour, retained 30 days
 *
 * Each heartbeat UPSERTs into both tables, adding to `samples`,
 * `cpu_sum`, `mem_pct_sum` and taking MAX() over `*_max`. Readers
 * compute avgs as sum / samples; we never need floating-point
 * rolling-mean arithmetic inside the INSERT.
 */
const metricsCols = {
  samples: integer("samples").notNull(),
  cpuSum: real("cpu_sum").notNull(),
  cpuMax: real("cpu_max").notNull(),
  memPctSum: real("mem_pct_sum").notNull(),
  memPctMax: real("mem_pct_max").notNull(),
  diskUsedGb: real("disk_used_gb"),
  cpuTempMax: real("cpu_temp_max"),
};

export const hostMetricsMinutely = pgTable(
  "host_metrics_minutely",
  {
    hostId: uuid("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "cascade" }),
    bucket: timestamp("bucket", { withTimezone: true }).notNull(),
    ...metricsCols,
  },
  (t) => ({ pk: primaryKey({ columns: [t.hostId, t.bucket] }) }),
);

export const hostMetricsHourly = pgTable(
  "host_metrics_hourly",
  {
    hostId: uuid("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "cascade" }),
    bucket: timestamp("bucket", { withTimezone: true }).notNull(),
    ...metricsCols,
  },
  (t) => ({ pk: primaryKey({ columns: [t.hostId, t.bucket] }) }),
);

export type HostMetricsRow = typeof hostMetricsHourly.$inferSelect;
