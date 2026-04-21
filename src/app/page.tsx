import Link from "next/link";
import {
  Terminal,
  Gamepad2,
  Users,
  Zap,
  Shield,
  Github,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { supportedGames } from "@/db/schema";

export default async function LandingPage() {
  let games: { id: string; name: string; description: string | null }[] = [];
  try {
    games = await db
      .select({
        id: supportedGames.id,
        name: supportedGames.name,
        description: supportedGames.description,
      })
      .from(supportedGames);
  } catch {
    games = [];
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,hsl(217_91%_60%/0.15),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] bg-[linear-gradient(to_bottom,transparent,hsl(var(--background)))]"
      />

      <header className="border-b border-border/50 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/20 text-primary">
              <Gamepad2 className="h-4 w-4" />
            </div>
            <span>GameServerOS</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/signup">Get Started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="container py-24 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-muted-foreground">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              No Linux experience required
            </div>
            <h1 className="text-balance text-5xl font-bold tracking-tight md:text-6xl lg:text-7xl">
              Host game servers{" "}
              <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
                in minutes
              </span>
            </h1>
            <p className="mt-6 text-balance text-lg text-muted-foreground md:text-xl">
              Link any Linux server to your dashboard with one command. Deploy
              Valheim, CS2, Project Zomboid, and more — all from a beautiful
              interface.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/signup">
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="#how-it-works">See how it works</Link>
              </Button>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="container py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold md:text-4xl">How it works</h2>
            <p className="mt-4 text-muted-foreground">
              Three steps. No config files. No SSH required after setup.
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-5xl gap-6 md:grid-cols-3">
            <Step
              icon={<Terminal className="h-5 w-5" />}
              number="1"
              title="Run one command"
              description="Copy a command from your dashboard, paste it into your server's terminal. The agent installs automatically."
            />
            <Step
              icon={<Gamepad2 className="h-5 w-5" />}
              number="2"
              title="Pick a game"
              description="Browse the catalog, click Deploy. SteamCMD handles downloading and installing. Ports open automatically."
            />
            <Step
              icon={<Users className="h-5 w-5" />}
              number="3"
              title="Play with friends"
              description="Share the server address. Monitor players, logs, and hardware usage from a clean dashboard, from anywhere."
            />
          </div>
        </section>

        <section className="container py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold md:text-4xl">Supported games</h2>
            <p className="mt-4 text-muted-foreground">
              First-class support, more on the way.
            </p>
          </div>
          <div className="mx-auto mt-12 grid max-w-5xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {games.length > 0
              ? games.map((g) => (
                  <div
                    key={g.id}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
                  >
                    <div className="flex h-full flex-col justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Gamepad2 className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{g.name}</div>
                      </div>
                    </div>
                  </div>
                ))
              : ["Valheim", "CS2", "Project Zomboid", "7 Days to Die", "Terraria"].map(
                  (name) => (
                    <div
                      key={name}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
                    >
                      <div className="flex h-full flex-col justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Gamepad2 className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold">{name}</div>
                        </div>
                      </div>
                    </div>
                  ),
                )}
          </div>
        </section>

        <section className="container py-20">
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
            <Feature
              icon={<Zap className="h-5 w-5" />}
              title="Real-time everything"
              description="CPU, memory, disk, and player counts update live. The dashboard reflects what's really happening on the server."
            />
            <Feature
              icon={<Shield className="h-5 w-5" />}
              title="Secure by default"
              description="API keys are hashed at rest. Sessions use HTTP-only cookies. Agents authenticate via bearer tokens on every connection."
            />
          </div>
        </section>

        <section className="container py-24">
          <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card/50 p-12 text-center">
            <h2 className="text-3xl font-bold md:text-4xl">
              Ready to start?
            </h2>
            <p className="mt-4 text-muted-foreground">
              Sign up free. Link your first host in under five minutes.
            </p>
            <div className="mt-8">
              <Button size="lg" asChild>
                <Link href="/signup">
                  Create your account
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50">
        <div className="container flex h-16 items-center justify-between text-sm text-muted-foreground">
          <span>© GameServerOS</span>
          <div className="flex items-center gap-4">
            <Link href="#" className="hover:text-foreground">
              Docs
            </Link>
            <a
              href="#"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Step({
  icon,
  number,
  title,
  description,
}: {
  icon: React.ReactNode;
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="relative rounded-xl border border-border bg-card p-6">
      <div className="absolute -top-3 left-6 rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
        {number}
      </div>
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
