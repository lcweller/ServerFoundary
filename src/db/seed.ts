import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { notInArray } from "drizzle-orm";
import { supportedGames } from "./schema";

/**
 * Seed the `supported_games` catalog.
 *
 * Split into two tiers:
 *
 *  MVP_GAMES      — TCP-only, works with the Cloudflare Tunnel relay, safe
 *                   to surface in the dashboard today (§3.5 launch set).
 *  V2_GAMES       — UDP or Steam-paid. Kept as rows so old deployments keep
 *                   rendering, but `available=false` so the catalog hides
 *                   them and the deploy button is gated. Will flip to
 *                   available once the custom WireGuard relay lands
 *                   (PROJECT.md §7.2).
 *
 * The egg_json mirrors a (minimal) subset of the Pterodactyl egg schema;
 * see src/lib/eggs.ts.
 */

type Seed = {
  id: string;
  name: string;
  steamAppId: number | null;
  defaultPort: number;
  defaultMaxPlayers: number;
  startupCommand: string;
  description: string;
  eggJson: unknown | null;
  available: boolean;
  protocol: "tcp" | "udp";
};

const MVP_GAMES: Seed[] = [
  {
    id: "minecraft_java",
    name: "Minecraft: Java Edition",
    steamAppId: null,
    defaultPort: 25565,
    defaultMaxPlayers: 20,
    // Legacy fallback; agent prefers the egg startup when present.
    startupCommand:
      "java -Xms512M -Xmx2048M -jar paper.jar nogui",
    description:
      "The launch game. Paper (a performance fork of the vanilla server) running Minecraft 1.20.1 — the most broadly-compatible modern version.",
    eggJson: {
      startup:
        "java -Xms512M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}} nogui",
      variables: [
        { env_variable: "SERVER_JARFILE", default_value: "paper.jar" },
        { env_variable: "SERVER_MEMORY", default_value: "2048" },
        { env_variable: "MINECRAFT_VERSION", default_value: "1.20.1" },
      ],
      install: {
        kind: "paper_jar",
        target: "paper.jar",
        version_variable: "MINECRAFT_VERSION",
      },
      bootstrap_files: {
        "eula.txt": "eula=true\n",
        // Writes a minimal server.properties before first boot so the port
        // matches what the platform allocated. Minecraft will fill in the
        // rest of the file on first run.
        "server.properties":
          "server-port={{PORT}}\nquery.port={{PORT}}\nmotd={{SERVER_NAME}}\nenable-query=false\n",
      },
    },
    available: true,
    protocol: "tcp",
  },
];

const V2_GAMES: Seed[] = [
  // UDP — blocked on the custom relay (§7.2). Kept as rows but hidden.
  {
    id: "valheim",
    name: "Valheim",
    steamAppId: 896660,
    defaultPort: 2456,
    defaultMaxPlayers: 10,
    startupCommand:
      './valheim_server.x86_64 -name "{SERVER_NAME}" -port {PORT} -world "Dedicated" -password "secret" -public 1',
    description:
      "Viking survival co-op. UDP — unlocks when the v2 WireGuard relay ships.",
    eggJson: null,
    available: false,
    protocol: "udp",
  },
  {
    id: "project_zomboid",
    name: "Project Zomboid",
    steamAppId: 380870,
    defaultPort: 16261,
    defaultMaxPlayers: 16,
    startupCommand: "./start-server.sh -port {PORT}",
    description:
      "Isometric zombie apocalypse survival sandbox. Uses UDP — unlocks with the v2 relay.",
    eggJson: null,
    available: false,
    protocol: "udp",
  },
  {
    id: "rust",
    name: "Rust",
    steamAppId: 258550,
    defaultPort: 28015,
    defaultMaxPlayers: 50,
    startupCommand:
      './RustDedicated -batchmode +server.port {PORT} +server.hostname "{SERVER_NAME}" +server.maxplayers 50',
    description:
      "Hardcore multiplayer survival. UDP — unlocks with the v2 relay.",
    eggJson: null,
    available: false,
    protocol: "udp",
  },
  {
    id: "csgo",
    name: "Counter-Strike: Global Offensive",
    steamAppId: 740,
    defaultPort: 27015,
    defaultMaxPlayers: 32,
    startupCommand:
      "rm -f ./bin/libgcc_s.so.1 ./bin/libstdc++.so.6 && bash ./srcds_run -game csgo -console -usercon +game_type 0 +game_mode 1 +mapgroup mg_active +map de_dust2 -port {PORT}",
    description:
      "Classic competitive FPS. Mostly UDP — unlocks with the v2 relay.",
    eggJson: null,
    available: false,
    protocol: "udp",
  },
];

const GAMES: Seed[] = [...MVP_GAMES, ...V2_GAMES];

async function main() {
  const url =
    process.env.DATABASE_URL ??
    "postgres://gameserveros:gameserveros@localhost:5432/gameserveros";

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  console.log("Seeding supported games...");
  const keepIds = GAMES.map((g) => g.id);
  const removed = await db
    .delete(supportedGames)
    .where(notInArray(supportedGames.id, keepIds))
    .returning({ id: supportedGames.id });
  if (removed.length > 0) {
    console.log(
      `Removed ${removed.length} stale games: ${removed.map((r) => r.id).join(", ")}`,
    );
  }
  for (const game of GAMES) {
    await db
      .insert(supportedGames)
      .values(game)
      .onConflictDoUpdate({
        target: supportedGames.id,
        set: game,
      });
  }
  console.log(
    `Seeded ${GAMES.length} games (${MVP_GAMES.length} MVP, ${V2_GAMES.length} v2).`,
  );

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
