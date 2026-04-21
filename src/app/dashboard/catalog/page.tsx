import { Gamepad2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { db } from "@/db";
import { supportedGames } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const games = await db.select().from(supportedGames).orderBy(supportedGames.name);

  return (
    <div>
      <PageHeader
        title="Game Catalog"
        description="Every game you can one-click deploy to a host. Deployment happens from a host's page."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((g) => (
          <Card key={g.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Gamepad2 className="h-5 w-5" />
                </div>
                <Badge variant="success">Available</Badge>
              </div>
              <h3 className="mt-4 font-semibold">{g.name}</h3>
              {g.description && (
                <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                  {g.description}
                </p>
              )}
              <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="font-mono">port {g.defaultPort}</span>
                <span>·</span>
                <span>up to {g.defaultMaxPlayers} players</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
