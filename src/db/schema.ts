import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
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
  startupCommand: text("startup_command").notNull(),
  description: text("description"),
});

export type User = typeof users.$inferSelect;
export type Host = typeof hosts.$inferSelect;
export type GameServer = typeof gameServers.$inferSelect;
export type GameServerLog = typeof gameServerLogs.$inferSelect;
export type SupportedGame = typeof supportedGames.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type EnrollmentToken = typeof enrollmentTokens.$inferSelect;
