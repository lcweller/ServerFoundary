import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { supportedGames } from "./schema";

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
    id: "cs2",
    name: "Counter-Strike 2",
    steamAppId: 730,
    defaultPort: 27015,
    defaultMaxPlayers: 32,
    startupCommand:
      "./game/bin/linuxsteamrt64/cs2 -dedicated +map de_dust2 -port {PORT}",
    description:
      "Competitive tactical FPS. Host a private server for scrims, casual play, or community events.",
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
    id: "seven_days_to_die",
    name: "7 Days to Die",
    steamAppId: 294420,
    defaultPort: 26900,
    defaultMaxPlayers: 8,
    startupCommand:
      "./7DaysToDieServer.x86_64 -configfile=serverconfig.xml -port {PORT}",
    description:
      "Open-world survival horror with tower defense elements. Every 7 nights, the horde comes.",
  },
  {
    id: "terraria",
    name: "Terraria",
    steamAppId: 105600,
    defaultPort: 7777,
    defaultMaxPlayers: 8,
    startupCommand: "./TerrariaServer.bin.x86_64 -port {PORT} -world world.wld",
    description:
      "2D sandbox adventure with crafting, exploration, and boss battles.",
  },
];

async function main() {
  const url =
    process.env.DATABASE_URL ??
    "postgres://gameserveros:gameserveros@localhost:5432/gameserveros";

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  console.log("Seeding supported games...");
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
