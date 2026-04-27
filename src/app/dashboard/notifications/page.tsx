import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listNotifications } from "@/lib/notifications";
import { PageContainer, PageHeader } from "@/components/hex/page";
import { HxCard } from "@/components/hex/card";
import { HxBadge } from "@/components/hex/badge";
import { relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function NotificationsHistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items = await listNotifications(user.id, {
    includeDismissed: true,
    limit: 200,
  });

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        subtitle="Last 200 events. Dismissed items remain visible here for 30 days."
      />
      <HxCard padding={0}>
        {items.length === 0 ? (
          <div className="px-[18px] py-12 text-center text-[12.5px] text-[var(--hx-muted-fg)]">
            Nothing here yet.
          </div>
        ) : (
          items.map((n) => {
            const ago = Math.floor(
              (Date.now() - new Date(n.createdAt).getTime()) / 1000,
            );
            const tone: "ok" | "warn" | "err" | "neutral" =
              n.severity === "err"
                ? "err"
                : n.severity === "warn"
                  ? "warn"
                  : "ok";
            const inner = (
              <div
                className="grid items-center gap-3 border-t px-[18px] py-[12px] text-[13px]"
                style={{
                  gridTemplateColumns: "70px 1fr 110px 110px",
                  borderColor: "var(--hx-border)",
                }}
              >
                <HxBadge size="sm" tone={tone}>
                  {n.severity}
                </HxBadge>
                <div className="min-w-0">
                  <div className="truncate font-medium">{n.title}</div>
                  {n.body && (
                    <div className="mt-0.5 truncate text-[12px] text-[var(--hx-muted-fg)]">
                      {n.body}
                    </div>
                  )}
                </div>
                <span className="hx-mono-tag text-[var(--hx-muted-fg)]">
                  {n.kind}
                </span>
                <span className="text-right font-mono text-[11.5px] text-[var(--hx-muted-fg)]">
                  {relativeTime(ago)}
                </span>
              </div>
            );
            return n.hostId ? (
              <Link
                key={n.id}
                href={`/dashboard/hosts/${n.hostId}`}
                className="block hover:bg-[var(--hx-chip)]"
              >
                {inner}
              </Link>
            ) : (
              <div key={n.id}>{inner}</div>
            );
          })
        )}
      </HxCard>
    </PageContainer>
  );
}
