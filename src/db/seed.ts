import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { notInArray } from "drizzle-orm";
import { supportedGames } from "./schema";

// Only games whose dedicated-server Steam app allows anonymous SteamCMD
// login are listed here. 7 Days to Die (294420), CS2 (730), etc. require a
// paid Steam account to download and will fail with "Missing configuration"
// if the agent tries to pull them anonymously. Rust and other anonymous
// server apps can be added later.
const games = [
  {
    id: "valheim",
    name: "Valheim",
    steamAppId: 896660,
    defaultPort: 2456,
    defaultMaxPlayers: 10,
    startupCommand:
      "./valheim_server.x86_64 -name \"{SERVER_NAME}\" -port {PORT} -world \"Dedicated\" -password \"secret\" -public 1",
    description:
      "Viking survival co-op. Explore a procedurally generated world with up to 10 friends.",
  },
  {
    id: "project_zomboid",
    name: "Project Zomboid",
    steamAppId: 380870,
    defaultPort: 16261,
    defaultMaxPlayers: 16,
    startupCommand: "./start-server.sh -port {PORT}",
    description:
      "Isometric zombie apocalypse survival sandbox. Build, loot, and survive together.",
  },
  {
    id: "rust",
    name: "Rust",
    steamAppId: 258550,
    defaultPort: 28015,
    defaultMaxPlayers: 50,
    startupCommand:
      "./RustDedicated -batchmode +server.port {PORT} +server.hostname \"{SERVER_NAME}\" +server.maxplayers 50",
    description:
      "Hardcore multiplayer survival. Gather resources, build bases, and try not to get raided.",
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
      "Classic competitive FPS. CS:GO dedicated server (pre-CS2) is still free-anonymous and perfect for a private lobby.",
  },
];

async function main() {
  const url =
    process.env.DATABASE_URL ??
    "postgres://gameserveros:gameserveros@localhost:5432/gameserveros";

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  console.log("Seeding supported games...");
  const keepIds = games.map((g) => g.id);
  // Remove entries no longer in the list (e.g., games that dropped anon
  // downloads). game_servers.gameId is plain text, not a FK, so existing
  // server rows keep working.
  const removed = await db
    .delete(supportedGames)
    .where(notInArray(supportedGames.id, keepIds))
    .returning({ id: supportedGames.id });
  if (removed.length > 0) {
    console.log(
      `Removed ${removed.length} stale games: ${removed.map((r) => r.id).join(", ")}`,
    );
  }
  for (const game of games) {
    await db
      .insert(supportedGames)
      .values(game)
      .onConflictDoUpdate({
        target: supportedGames.id,
        set: game,
      });
  }
  console.log(`Seeded ${games.length} games.`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
