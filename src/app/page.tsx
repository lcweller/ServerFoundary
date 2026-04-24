import Link from "next/link";
import { db } from "@/db";
import { supportedGames } from "@/db/schema";
import { HxCard } from "@/components/hex/card";
import { HxBadge } from "@/components/hex/badge";
import { HexLogo, HexWordmark } from "@/components/hex/logo";
import { HxGameTile } from "@/components/hex/game-tile";
import { HxIcon } from "@/components/hex/icons";
import { WaitlistForm } from "./waitlist-form";

export default async function LandingPage() {
  let games: { id: string; name: string; description: string | null }[] = [];
  try {
    games = await db
      .select({
        id: supportedGames.id,
        name: supportedGames.name,
        description: supportedGames.description,
      })
      .from(supportedGames)
      .orderBy(supportedGames.name);
  } catch {
    games = [];
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--hx-app-bg)", color: "var(--hx-fg)" }}
    >
      <header
        className="sticky top-0 z-20 border-b backdrop-blur-md"
        style={{
          borderColor: "var(--hx-border)",
          background: "color-mix(in oklch, var(--hx-bg) 80%, transparent)",
        }}
      >
        <div className="mx-auto flex h-14 max-w-[1200px] items-center px-6">
          <HexWordmark size={15} />
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="px-2 text-[13px] text-[var(--hx-muted-fg)] hover:text-[var(--hx-fg)]"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-[32px] items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium"
              style={{
                background: "var(--hx-fg)",
                borderColor: "var(--hx-fg)",
                color: "var(--hx-bg)",
              }}
            >
              Get started <HxIcon.arrowRight size={13} />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6">
        {/* Hero */}
        <section className="py-24 text-center">
          <div className="mb-5 flex justify-center">
            <HxBadge size="sm" tone="accent">
              Game server hosting, reimagined
            </HxBadge>
          </div>
          <h1
            className="mx-auto max-w-4xl text-balance text-5xl font-semibold md:text-6xl"
            style={{ letterSpacing: "-0.03em", lineHeight: 1.05 }}
          >
            Host game servers in minutes.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-[15px] text-[var(--hx-muted-fg)] md:text-base">
            Link any Linux machine to a beautiful dashboard with one command.
            Deploy Valheim, CS:GO, Project Zomboid, and more. No Linux
            experience required.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <div className="flex w-full max-w-md justify-center">
              <WaitlistForm source="landing-hero" />
            </div>
            <div className="flex items-center gap-2 text-[12.5px] text-[var(--hx-muted-fg)]">
              <span>Already have an account?</span>
              <Link
                href="/login"
                className="text-[var(--hx-accent-fg)] hover:underline"
              >
                Log in
              </Link>
              <span>·</span>
              <Link
                href="#how-it-works"
                className="text-[var(--hx-muted-fg)] hover:text-[var(--hx-fg)]"
              >
                See how it works
              </Link>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="py-16">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-semibold" style={{ letterSpacing: "-0.02em" }}>
              Three steps
            </h2>
            <p className="mt-2 text-[14px] text-[var(--hx-muted-fg)]">
              No config files. No SSH needed after setup.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                n: "01",
                t: "Run one command",
                d: "Copy a command from your dashboard, paste it into your server's terminal. The agent installs itself and enrolls automatically.",
              },
              {
                n: "02",
                t: "Pick a game",
                d: "Browse the catalog, click Deploy. SteamCMD handles downloading and installing. Firewall ports open automatically.",
              },
              {
                n: "03",
                t: "Play with friends",
                d: "Share the server address. Monitor players, logs, and hardware usage from a clean dashboard, from anywhere.",
              },
            ].map((s) => (
              <HxCard key={s.n} padding={24}>
                <div className="hx-mono-tag mb-2 text-[var(--hx-accent-fg)]">
                  {s.n}
                </div>
                <h3 className="text-[16px] font-semibold">{s.t}</h3>
                <p className="mt-1.5 text-[13.5px] leading-[1.55] text-[var(--hx-muted-fg)]">
                  {s.d}
                </p>
              </HxCard>
            ))}
          </div>
        </section>

        {/* Supported games */}
        <section className="py-16">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-semibold" style={{ letterSpacing: "-0.02em" }}>
              Supported games
            </h2>
            <p className="mt-2 text-[14px] text-[var(--hx-muted-fg)]">
              First-class support, more on the way.
            </p>
          </div>
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            }}
          >
            {(games.length > 0
              ? games
              : [
                  { id: "valheim", name: "Valheim", description: null },
                  { id: "csgo", name: "CS:GO", description: null },
                  { id: "rust", name: "Rust", description: null },
                  { id: "project_zomboid", name: "Project Zomboid", description: null },
                ]
            ).map((g) => (
              <HxCard
                key={g.id}
                padding={16}
                className="flex items-center gap-3"
              >
                <HxGameTile gameId={g.id} size={40} />
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium">
                    {g.name}
                  </div>
                  <div className="font-mono text-[11px] text-[var(--hx-muted-fg)]">
                    Ready to deploy
                  </div>
                </div>
              </HxCard>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="py-24">
          <HxCard padding={40} className="text-center">
            <h2
              className="text-3xl font-semibold"
              style={{ letterSpacing: "-0.02em" }}
            >
              Early access
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-[14px] text-[var(--hx-muted-fg)]">
              We&apos;re launching in waves. Drop your email and we&apos;ll let
              you in as soon as your spot opens up.
            </p>
            <div className="mt-6 flex justify-center">
              <WaitlistForm source="landing-cta" />
            </div>
          </HxCard>
        </section>
      </main>

      <footer
        className="border-t"
        style={{ borderColor: "var(--hx-border)" }}
      >
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-6 text-[13px] text-[var(--hx-muted-fg)]">
          <div className="flex items-center gap-2">
            <HexLogo size={14} />
            <span>© ServerForge</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="#" className="hover:text-[var(--hx-fg)]">
              Docs
            </Link>
            <a
              href="https://github.com/lcweller/ServerFoundary"
              className="hover:text-[var(--hx-fg)]"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
