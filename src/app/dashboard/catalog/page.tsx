import { db } from "@/db";
import { supportedGames } from "@/db/schema";
import { PageContainer, PageHeader } from "@/components/hex/page";
import { HxCard } from "@/components/hex/card";
import { HxBadge } from "@/components/hex/badge";
import { HxGameTile } from "@/components/hex/game-tile";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const games = await db
    .select()
    .from(supportedGames)
    .orderBy(supportedGames.name);

  return (
    <PageContainer>
      <PageHeader
        title="Games"
        subtitle={`${games.length} ${games.length === 1 ? "game" : "games"} you can one-click deploy. Deployment happens from a host's page.`}
      />
      <div
        className="grid gap-[var(--hx-gap-md)]"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
      >
        {games.map((g) => (
          <HxCard key={g.id} padding={18} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <HxGameTile gameId={g.id} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">{g.name}</div>
                <div className="font-mono text-[11px] text-[var(--hx-muted-fg)]">
                  port {g.defaultPort} · up to {g.defaultMaxPlayers}
                </div>
              </div>
              <HxBadge tone="ok" size="sm">
                Available
              </HxBadge>
            </div>
            {g.description && (
              <p className="text-[12.5px] leading-[1.55] text-[var(--hx-muted-fg)]">
                {g.description}
              </p>
            )}
            <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--hx-muted-fg)]">
              {g.steamAppId != null && <span>steam {g.steamAppId}</span>}
            </div>
          </HxCard>
        ))}
      </div>
    </PageContainer>
  );
}
