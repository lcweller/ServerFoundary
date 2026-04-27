# CLAUDE.md — working context for AI tools

**Read `PROJECT.md` at the repo root first** — that is the single source of
truth for product direction, architectural decisions, implementation order,
and what's explicitly out of scope. This file is a short working-context
summary for the next AI-assisted session so you don't have to re-discover
every decision from scratch.

If anything here conflicts with `PROJECT.md`, `PROJECT.md` wins.

---

## Where we are today (MVP critical-path status)

PROJECT.md §11 lists 19 MVP steps. Status:

| # | Step | Status |
|---|---|---|
| 1 | Scaffold + Dockerfile | ✅ |
| 2 | Deployment wiring (Unraid + Cloudflare Tunnel) | ✅ — serverforge/game.layeroneconsultants.com live |
| 3 | Auth | ⚠️ **Rolled custom email+password with bcrypt, not Supabase Auth yet.** See `src/lib/auth.ts`. |
| 4 | Landing + waitlist | 🟡 landing done, waitlist in Phase 1 of next-phases plan |
| 5 | Host data model + pairing + agent skeleton | ✅ — **agent is Node.js/TypeScript, not Go yet** (see `agent/agent.ts`, bundled by `scripts/build-agent.ts` to `public/agent.cjs`) |
| 6 | Dashboard + live metrics sparklines | ✅ — sparklines accrete client-side; no historical aggregation yet |
| 7 | Host detail Overview | ✅ |
| 8 | Linux install script | ✅ — `public/install.sh` |
| 9 | **Relay for game traffic (§2.4)** | ✅ via ADR 0001 Option A — in-container TCP relay through the existing agent WS. Players dial `RELAY_PUBLIC_HOSTNAME:30000-30099`. Requires a one-time port-forward of that range on the platform operator's router. UDP still waits on §7.2's WireGuard relay. |
| 10 | Minecraft deployment | ❌ Not done. Catalog has Valheim/CS:GO/Rust (mostly UDP, wrong for MVP) |
| 11 | Lifecycle controls | ✅ |
| 12 | Logs | ✅ |
| 13 | Remote terminal | ✅ — opt-in per host, every command + terminal session lands in `audit_events` and the Settings tab Audit log (§3.6, §6.1) |
| 14 | Notifications | ✅ — in-app bell + dropdown + history page. Triggers wired: host online/offline, host paired, server crashed, backup completed/failed, login failed. **Email via Resend deferred** (see Known stack divergences). |
| 15 | Backups | ✅ — on-host tar.gz + schedule + retention + restore. **R2/S3 destination deferred** (see "Known stack divergences" below). |
| 16 | Agent self-update | ❌ |
| 17 | Terraria | ❌ |
| 18 | Security hardening (cgroups, AppArmor, per-server user) | 🟡 Partial — sysctl, fail2ban, unattended-upgrades, narrow sudoers for `ufw` done. No cgroups v2, no AppArmor, no per-server Linux user. |
| 19 | GameServerOS ISO | ❌ |

**The critical path test from §11**: sign up → install → deploy Minecraft → friend on a different network connects via platform hostname → metrics + logs → stop. Currently blocked at step 9 (tunnel) and step 10 (Minecraft).

---

## Known stack divergences from PROJECT.md

These are pragmatic choices that got us to a working MVP faster; each has a
migration target documented and will be revisited as a dedicated phase.

| Topic | PROJECT.md target | What's built now | Why |
|---|---|---|---|
| Database | Supabase Postgres (§0.5, §2.1) | Vanilla Postgres via Drizzle | Faster bootstrap; no external SaaS dependency during prototyping. Migration is mostly a connection-string swap. |
| Auth | Supabase Auth (§2.1, §3.1) | Custom bcrypt + session cookies (`src/lib/auth.ts`) | Wanted auth working before an external dep was introduced. Migrating is a bigger job — every protected page + API route uses `getCurrentUser()`. |
| Agent language | Go (§0.3) | Node.js/TypeScript, esbuild bundle | Faster to prototype, shared types with server, no native-module pain. Go rewrite is Phase 10. |
| Game tunnel | Cloudflare Tunnel per server (§2.4) | In-container TCP relay over the existing WS (ADR 0001 Option A) | PROJECT.md §2.4's CF Tunnel assumption doesn't survive first contact — CF's free tier only proxies HTTP/S. See /docs/decisions/0001. |
| Deploy target | Minecraft Java first (§3.5) | Valheim / CS:GO / Rust / Project Zomboid | Most of the current catalog is UDP — won't work with Cloudflare Tunnel. Must prune and add Minecraft Java. |
| Backup destination | S3-compatible / Cloudflare R2 (§3.10) | Local on the host's own disk under `<SERVERS_DIR>/<id>/.gameserveros-backups/` | Avoids an external dep during MVP. Schema reserves a `destination` column (`local` today, `r2`/`s3` later) so adding R2 is data-only. The `backups` table also already carries `path`, `size_bytes`, `started_at`, `completed_at` — those don't change shape when we add a remote destination. |
| Notification email | Resend (§3.11) | In-app bell only | Avoids an external dep + signup before the user actually has subscribers. The `notifications` table is the source of truth; an email worker layered on later just SELECTs from it. Per-user prefs are deferred (single global "in-app on" today). |

See `/docs/decisions/` (to be created as we resolve migrations).

---

## Repo layout cheatsheet

```
/PROJECT.md              ← canonical
/CLAUDE.md               ← this file
/agent/agent.ts          ← Node agent source (bundled to public/agent.cjs at build)
/public/install.sh       ← one-liner installer, runs on target Linux hosts
/public/agent.cjs        ← generated by `npm run build:agent`; .gitignored
/scripts/build-agent.ts  ← esbuild bundler for the agent
/ws-server.ts            ← standalone WebSocket server entrypoint (port 3001)
/docker/entrypoint.sh    ← container entrypoint; runs migrations + seed, then both Next and ws-server
/Dockerfile              ← multi-stage Node 18 slim build
/unraid/                 ← Unraid Docker template XML
/src/
  app/
    (auth)/login,signup  ← auth pages
    api/                 ← REST routes (all UI data access)
    api/v1/agent/        ← agent-only endpoints (enroll, WS upgrade handled in ws-server)
    dashboard/           ← protected app shell
    page.tsx             ← landing
  components/
    hex/                 ← Hexmesh design-system primitives (see 'Hexmesh' below)
    dashboard/           ← dashboard-specific composites
    ui/                  ← shadcn primitives (Button, Dialog, etc. — used sparingly now)
  db/
    schema.ts            ← Drizzle schema
    migrations/          ← generated SQL, committed
    migrate.ts, seed.ts  ← run in entrypoint on container start
  lib/
    auth.ts              ← current custom-auth helpers
    agent-hub.ts         ← cross-process command dispatch
    hosts.ts, format.ts  ← shared helpers
    ws-server.ts         ← WS upgrade handler, agent message router
```

### UI convention — "Hexmesh"

All dashboard UI uses the **`src/components/hex/*`** primitive set: `HxCard`,
`HxButton`, `HxBadge`, `StatusDot`, `Sparkline`, `HxIcon`, `HxGameTile`,
`PageContainer`, `PageHeader`, etc. Don't reach for shadcn's `Button`/`Card`
inside `/dashboard/*` — use the `Hx*` versions so the visual language stays
consistent. The token system is in `src/app/globals.css` (`--hx-*` OKLch
variables) and `tailwind.config.ts`.

Fonts (Geist + Geist Mono) come from Google Fonts via a `<link>` in
`src/app/layout.tsx`. `next/font/google` in Next 14.2 doesn't know Geist.

### Sparkline discipline

`useRollingSeries(value, length)` in `src/components/hex/use-rolling-series.tsx`
accretes a rolling window of **real observed values** as they change. Never
fabricate data for a sparkline. If we don't have history yet, the component
renders a flat placeholder line. Long-term metric history is Phase 4.

---

## Conventions

### Code style
- TypeScript strict everywhere; no `any`. Use narrow types.
- Prefer server components for anything that can render on the server.
  Client components only when they use hooks / event handlers.
- API routes return plain JSON; keep shapes stable (clients depend on them).
- Drizzle queries live in API route handlers or page server components —
  not in shared "service" files yet. Keep query + handler co-located until
  we have three duplicates of the same query.

### Commits
- One logical change per commit. Body should answer "why", not "what".
- Claude-originated commits sign with
  `https://claude.ai/code/session_<id>` in the trailer — keep doing this.

### Don't add npm packages unless truly required.
The existing set covers 99% of what we need. Before adding one, consider:
could an inline component or a standard-library approach do the job?
Exception: `cloudflared` in Phase 3 — that's a real binary, pulled at runtime
by the agent, not an npm dep.

### Environment variables
- `DATABASE_URL` — Postgres connection string
- `NEXT_PUBLIC_APP_URL` — public URL of the dashboard (no trailing slash,
  no port when behind Cloudflare Tunnel)
- `NEXT_PUBLIC_AGENT_WS_URL` — public wss:// URL agents dial
- `AGENT_WS_PORT` — local ws-server port (default 3001)
- `INTERNAL_API_KEY` — shared secret between the Next.js process and the
  ws-server process for cross-process command dispatch
- `SESSION_COOKIE_SECURE` — `true` to mark the auth cookie Secure (auto-
  inferred when `NEXT_PUBLIC_APP_URL` is https://)
- `EXTERNAL_PORT_START`, `EXTERNAL_PORT_COUNT` — the TCP port range the
  in-container relay binds for game traffic (default 30000-30099). Must
  be port-forwarded on the operator's router.
- `RELAY_PUBLIC_HOSTNAME` — hostname players dial to reach a game server.
  Defaults to the host part of `NEXT_PUBLIC_APP_URL`.

See `.env.example` for the canonical list.

### Security baselines already in place
- Session cookies: HTTP-only, SameSite=Lax, Secure-when-HTTPS
- Install.sh applies: ufw (deny-in, allow-SSH), fail2ban SSH jail, sysctl
  hardening (SYN cookies, rp_filter, no ICMP redirects), unattended-upgrades
  with auto-reboot 04:00, SSH `MaxAuthTries 3` + no empty pw + no X11/TCP
  forwarding, journald cap 500MB, core dumps off, narrow sudoers drop-in
  so the agent user can run only `ufw allow/delete allow/status`
- Agent→dashboard WS auth: Bearer token, hashed API key in DB

### Things to NOT break (from the prior V10 spec and still relevant)
- `/api/*` route shapes — UI depends on them
- DB schema without a migration
- Agent enrollment flow (the `enrollment_tokens` → `apiKey` handshake)
- The WebSocket protocol between agent and ws-server (message `type`s live
  in `src/lib/ws-server.ts` as a discriminated union)
- `public/install.sh` — field-tested on real Linux hosts; if you change
  it, mention that the user will need to re-run the installer or refetch
  `agent.cjs`.

---

## Current deployed URLs

- Dashboard: `https://game.layeroneconsultants.com`
- Agent WS: `wss://game-ws.layeroneconsultants.com`
- Image: `ghcr.io/lcweller/serverfoundary:latest`
- Unraid template: `unraid/serverfoundary.xml`

Force-update the Unraid container to pick up new image pushes. Remember the
agent binary on each host is separate — re-run the install command (or
`curl … -o /opt/gameserveros/bin/agent.cjs + systemctl restart`) to pick
up agent changes.

---

## What to work on next

See PROJECT.md §11 and the phases plan at the top of the current session.
The short version: **Cloudflare Tunnel for game traffic** is the single
most important next feature — the `curl | bash` install UX described in
§2.5 is not actually delivered until a friend on a different network can
reach a Minecraft server on a paired host without touching router settings.
