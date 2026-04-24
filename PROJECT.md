# PROJECT.md — ServerForge

> Single source of truth for the platform. Drop this at the repo root so any AI tool (Claude Code, Cursor, etc.) has full context before making changes.

---

## 0. Resolved decisions

These foundational decisions have been made and supersede any conflicting language elsewhere in this document. When the doc ever seems to pull in two directions, these win.

### 0.1 Target audience — non-technical primary (long term), Linux hobbyist first (MVP)

**Ultimate primary persona**: completely non-technical users who know nothing about computers. This is the audience the product is designed *for*, long term. The "would my parent get stuck here?" test applies.

**MVP launch audience**: Linux-comfortable hobbyists, Discord admins, small community hosts. They inherit a product designed for their non-technical friends and are where we collect feedback and harden the core before the Windows launch.

**Secondary personas (always)**: gamers 18-40, content creators. Supported, not targeted.

See 0.4 for the staged rollout plan.

### 0.2 NAT traversal — tunnel/relay only, no port forwarding

The product **will not require port forwarding** at any stage. All game traffic reaches the host via an outbound tunnel established by the agent. Users never touch their router. Hard architectural rule; if a feature can't be implemented without inbound ports, it doesn't ship.

See Section 2.4 for provider choice.

### 0.3 Agent language — Go

The agent is written in Go. Single static binary, cross-compiles cleanly to Linux/Windows/macOS, fast startup, small footprint, strong concurrency primitives for supervising multiple game server processes.

### 0.4 Staged rollout

**MVP (Linux only)** — Go agent distributed via `curl | bash` install script and as a pre-configured Debian ISO (GameServerOS). Audience: Linux hobbyists. No Windows or macOS builds in MVP.

**Phase 2 (Windows)** — once MVP is proven in the wild, ship a signed `.msi` installer with an Authenticode EV certificate. At this point the 5-click onboarding bar in 2.5 becomes enforceable and the primary non-technical persona is served.

**v2 (UDP games)** — build a custom WireGuard relay to support UDP games (Valheim, Rust, ARK, CS2, 7 Days to Die). See Section 7.2.

### 0.5 Infrastructure — self-hosted on Unraid

Platform runs in a Docker container on Landon's Unraid server. Database is Supabase (managed Postgres, free tier). Public exposure is via Cloudflare Tunnel to a public domain.

### 0.6 Monetization — deferred until post-MVP

No billing in the MVP. Free to use. Revisit pricing and tier structure based on real usage data after launch. Architecture decisions should not preclude freemium later — specifically, collect per-user/per-host metrics now so the data exists when pricing decisions happen.

---

## 1. What this platform is

A web platform that lets users host their own multiplayer game servers on hardware they already own (home PC, spare laptop, rented VPS). Users run a single install command (MVP) or a signed installer (Phase 2); the platform handles deployment, monitoring, updates, NAT traversal, and lifecycle management.

**Key distinction from competitors** — this is NOT a traditional game server host (where users rent a managed box). Users bring their own hardware. We are the orchestration, management, and networking layer on top.

**Target audience** — see 0.1 and 0.4.

**Emotional positioning (Phase 2, when Windows ships)** — "Host a game server for your friends as easily as launching an app. No port forwarding. No Linux required. No monthly fees."

**Positioning during MVP (Linux only)** — "Self-hosted game server management that actually works. Your hardware, your rules, zero router config."

---

## 2. Architecture overview

Four components:

### 2.1 Web dashboard (Next.js)
- Hosted in a Docker container on Landon's Unraid server
- Exposed to the public internet via Cloudflare Tunnel (same infra approach as game server traffic — one less thing to learn)
- Frontend: Next.js 16+, React 19, TypeScript, Tailwind CSS, shadcn/ui
- Backend: Next.js API routes + Server Actions
- Database: **Supabase** (managed Postgres, free tier; Drizzle ORM client-side for type-safe queries)
- Auth: **Supabase Auth** (saves weeks of work vs rolling our own; free; easy migration path to Better Auth later if lock-in becomes a problem)
- Real-time: Node.js WebSocket server colocated in the same container for agent ↔ platform communication
- WebSocket note: self-hosting is actually an advantage here — Vercel's serverless model makes persistent WebSocket servers awkward. Running everything in one Docker container makes this trivial.

### 2.2 Agent (Go)
- Runs on the user's hardware
- **MVP distribution**: Linux binary, installed via `curl -sSL https://install.serverforge.gg | bash` with pairing code as env var; or pre-baked into the GameServerOS ISO (2.3)
- **Phase 2 distribution**: signed Windows `.msi`
- **Future**: signed macOS `.pkg` with notarization
- Connects outbound over WebSocket-over-TLS (no inbound ports required for control channel)
- Persistent connection with 3-second heartbeat
- Responsibilities:
  - Report system vitals (CPU, memory, disk, network, temperature)
  - Manage game server processes (start/stop/restart/delete) with resource limits (cgroups v2)
  - Establish and maintain game traffic tunnels (see 2.4)
  - Stream logs back to the platform
  - Expose a remote shell via WebSocket tunnel (opt-in, audited)
  - Apply platform-pushed configuration changes
  - Self-update when platform publishes a new agent version (signature verified)

### 2.3 GameServerOS (Custom Linux ISO) — MVP alternative install path
- Debian 12-based custom bootable ISO built with `live-build`
- First-boot TUI installer walks user through disk selection, network, pairing
- Agent pre-baked, auto-configures from pairing code entered at boot
- Hardened out of the box (firewall, AppArmor, sysctl tuning)
- **Positioning in MVP**: offered alongside the `curl | bash` install for users who want a dedicated host and don't already have Linux installed. Same MVP priority as the install script.

### 2.4 Tunnel / relay layer

All game traffic flows via outbound tunnel established by the agent (per 0.2).

**MVP provider: Cloudflare Tunnel.** Free, unlimited, TCP-only. The agent embeds or downloads `cloudflared` and provisions a hostname per game server. Chosen because:
- Zero cost at any pre-launch scale
- Same tunnel tech Landon is using to expose the platform itself → one system to understand
- Cloudflare's edge network means low latency globally
- `cloudflared` is Go-native, integrates cleanly with our Go agent

**Constraint**: Cloudflare Tunnel is TCP-only. MVP launch catalog is limited to TCP games (Minecraft Java, Terraria). UDP games wait for v2 custom relay.

### 2.5 Onboarding flow — the UX bars

Two UX targets, per the staged rollout:

**MVP (Linux host):**
1. Sign up at the platform site (email + password)
2. Click "Add this computer as a host" → dashboard displays `curl | bash` command with embedded pairing code
3. Paste the command into the Linux host's terminal and hit enter
4. Host appears online in the dashboard within seconds
5. Click "Create server" → pick Minecraft → server is live, shareable hostname displayed

Acceptable bar for the Linux-comfortable MVP audience. Requires one terminal command.

**Phase 2 (Windows host):**
1. Sign up
2. Click "Add this computer" → download signed `.msi`
3. Run installer (no warnings thanks to EV cert); displays 6-digit pairing code
4. Type pairing code on the website
5. Click "Create server" → pick a game → live

≤5 clicks, no terminal, no warnings, no router changes. This is the target bar for reaching the non-technical primary persona. If any step fails this test, Phase 2 isn't ready.

---

## 3. Complete feature list

### 3.1 Authentication & accounts
*Implementation note: Supabase Auth provides all of this out of the box. Don't rebuild.*
- [ ] Email/password signup
- [ ] Email/password login with session cookies
- [ ] Password change (requires current password)
- [ ] Account deletion with confirmation (cascades to remove hosts, servers, backups)
- [ ] User profile: name, email (read-only once verified), created date
- [ ] Session management (persistent across browser refresh, 30-day expiry)

### 3.2 Host management
Install paths for MVP, both primary:
- **`curl | bash` install script** — Linux host, one terminal command with pairing code embedded. Primary MVP path.
- **GameServerOS ISO** — download bootable ISO, flash to USB, boot target machine, enter pairing code at first-boot TUI. Alternate MVP path for users without an existing Linux box.

Deferred to Phase 2:
- Windows `.msi` installer (signed)
- macOS `.pkg` (signed + notarized)

Feature list:
- [ ] Pairing code generation — human-readable format `XXXX-XXXX`, expires after 15 minutes
- [ ] Zero-config enrollment — agent connects with pairing code, platform issues long-lived auth token, agent stores it locally, reconnects using token afterward
- [ ] Host list view — all hosts with online/offline status, game server count, resource summary
- [ ] Host detail page with tabs: Overview, Game Servers, Terminal, Logs, Settings
- [ ] Rename host (display name, not hostname)
- [ ] Remove host (confirmation dialog, revokes agent token, disconnects agent)
- [ ] Host status: online / offline / connecting / updating
- [ ] Display host metadata: hostname, external IP, OS, kernel, CPU model, core count, RAM, storage, GPU, agent version, uptime

### 3.3 Real-time monitoring
- [ ] WebSocket heartbeat every 3 seconds from agent to platform
- [ ] Live CPU usage (overall + per-core optional)
- [ ] Live memory usage (used/total in GB)
- [ ] Live disk usage per mount (used/total in GB)
- [ ] Network I/O throughput (MB/s up/down)
- [ ] CPU temperature (when available)
- [ ] GPU model and temperature (when GPU present)
- [ ] Per-game-server player counts
- [ ] Metrics history stored in Supabase (hourly aggregates for 30 days)
- [ ] Live sparkline charts in dashboard cards
- [ ] Per-user/per-host usage metrics collected (groundwork for future monetization per 0.6)

### 3.4 GameServerOS (custom ISO)
- [ ] `live-build` configuration producing hybrid bootable ISO (BIOS + UEFI)
- [ ] First-boot TUI in dialog/whiptail: welcome → disk selection → network (DHCP/static) → pairing code → install → success
- [ ] Hardened base image (minimal packages, nftables default-deny, AppArmor, sysctl hardening, unattended-upgrades, unprivileged agent user)
- [ ] ISO download from dashboard (signed URL from R2)
- [ ] Agent binary embedded; pairing code entered at boot auto-wires config

### 3.5 Game server deployment

**Launch game**: Minecraft Java Edition. TCP protocol works with Cloudflare Tunnel. Largest audience. Best community docs.

**MVP catalog** (deploy in this order):
1. Minecraft Java Edition (TCP)
2. Terraria (TCP)
3. Project Zomboid (verify protocol — if UDP, defer to v2)

**v2 additions** (require custom UDP relay): Valheim, Rust, ARK: Survival Evolved, Counter-Strike 2, 7 Days to Die.

- [ ] Game catalog page listing supported games
- [ ] Each game entry: name, description, official logo, SteamCMD app ID, default port, protocol (tcp/udp), RAM recommendation (min/rec), config schema
- [ ] Deploy flow: choose game → choose host → name it → configure → deploy → progress UI → success
- [ ] Lifecycle actions: start, stop, restart, delete
- [ ] Per-server configuration editing (with restart prompt if running)
- [ ] Process isolation per server (separate Linux user + AppArmor profile)
- [ ] Resource limits per server (cgroups v2 memory/CPU/IO caps)
- [ ] Port conflict detection
- [ ] SteamCMD orchestration where applicable
- [ ] **Pterodactyl egg format compatibility** — define game templates in the Pterodactyl "egg" JSON format so we can import community-maintained templates instead of writing our own for every game

### 3.6 Remote terminal (opt-in, audited)
- [ ] Browser-based shell via xterm.js in the dashboard
- [ ] WebSocket PTY tunnel: dashboard ↔ platform ↔ agent ↔ shell process (bash on Linux)
- [ ] Disabled by default per host; user must explicitly enable in host settings
- [ ] Every session logged with timestamp, source IP, user ID; visible to host owner in audit log
- [ ] "Open Terminal" button; empty state when host offline or terminal disabled
- [ ] Copy/paste, resize handling, command history (session-local)

### 3.7 Logs
- [ ] Live log streaming from agent (host-level + per-game-server)
- [ ] Filters: source, severity, time range
- [ ] Text search within current view
- [ ] Auto-scroll toggle
- [ ] Retention: 7 days in Supabase, older archived to R2
- [ ] Each entry: timestamp, source, severity, message
- [ ] Export as plain text

### 3.8 Agent self-update
- [ ] Platform tracks current recommended agent version
- [ ] Agent checks version on connect; outdated agents get update command + signed download URL
- [ ] Agent downloads new binary, verifies signature, swaps, restarts (systemd)
- [ ] Rollback: new agent fails health check within 2 min → revert to previous
- [ ] Update history logged per host
- [ ] Signing key stored in platform KMS — NEVER in repo or CI secrets

### 3.9 Security hardening (agent + GameServerOS)
- [ ] nftables firewall default-deny:
  - Outbound: platform endpoints, DNS, NTP, Steam CDN (SteamCMD), Cloudflare Tunnel endpoints
  - Inbound: **nothing from public internet** (tunnel carries game traffic); optional SSH; localhost-only for game server ports
- [ ] Per-game-server process isolation (separate Linux user per instance)
- [ ] AppArmor profiles for game server binaries
- [ ] Resource caps (memory, CPU, disk I/O) per game server via cgroups v2
- [ ] Agent runs as non-root user with narrow sudo (only for starting/stopping game servers)
- [ ] Secrets (agent token, passwords) in `/etc/serverforge/secrets` mode 600 owned by agent user
- [ ] Platform API: all agent requests signed with HMAC using agent token; rate-limited per agent
- [ ] Platform API: user API requests protected by Supabase Auth session + CSRF tokens

### 3.10 Backup system
- [ ] Per-game-server backup config: enable/disable, schedule (cron), retention, destination (S3-compatible; default to Cloudflare R2)
- [ ] On-demand backup button
- [ ] Backup format: tar.gz of save directory + config
- [ ] Backup history with download and restore actions
- [ ] Restore flow: select → confirm (stops server) → agent downloads → applies → restarts

### 3.11 Notifications
- [ ] In-app notification bell with unread count
- [ ] Dropdown, paginated
- [ ] Mark read individually or all; dismiss
- [ ] Full history page
- [ ] Severity: info / warning / error
- [ ] 14 triggers: host online, host offline, agent update success, agent update failed, server started, server crashed, server updated, server update failed, backup completed, backup failed, memory threshold (default 85%), disk threshold (default 85%), new host paired, authentication failure
- [ ] Optional email via Resend (free tier)

### 3.12 Dashboard UI
- [ ] Operations overview page with hero metrics, host cards, worlds in session, activity feed
- [ ] Hosts list page
- [ ] Host detail (Overview, Game Servers, Terminal, Logs, Settings tabs)
- [ ] Game catalog page
- [ ] Settings (profile, password, notifications, danger zone)
- [ ] Landing page (early access waitlist)

### 3.13 Landing / coming soon page
- [ ] Hero, problem statement, solution summary, three steps, supported games grid
- [ ] Early access email capture (`waitlist_signups` table)
- [ ] Minimal footer

---

## 4. Data model

Drizzle ORM schema in `/drizzle/schema.ts`, applied against Supabase Postgres:

- `users` — *managed by Supabase Auth*; extend via `user_profiles` (user_id FK, display_name, created_at) for app-specific fields
- `hosts` — id, user_id, name, hostname, external_ip, os, os_version, cpu_model, cpu_cores, ram_bytes, storage_bytes, gpu_model, agent_version, status, last_seen_at, created_at, agent_token_hash
- `host_metrics_hourly` — host_id, hour_bucket, cpu_avg, cpu_max, mem_avg, mem_max, disk_used, net_in, net_out
- `pairing_codes` — code, user_id, host_id_assigned_to, expires_at, used_at
- `game_catalog` — id, slug, name, description, steam_app_id, default_port, protocol, min_ram_mb, rec_ram_mb, egg_json, logo_url
- `game_servers` — id, host_id, game_id, name, port, config_json, status, pid, player_count, max_players, created_at, last_started_at
- `tunnels` — id, server_id, provider, external_hostname, created_at, last_connected_at, status
- `game_server_logs` — id, server_id, ts, severity, message (partitioned by week, archived at 7 days)
- `host_logs` — id, host_id, ts, severity, message
- `backups` — id, server_id, started_at, completed_at, size_bytes, storage_url, status, retention_until
- `backup_configs` — server_id, enabled, schedule_cron, retention_count, destination_type, destination_config_json
- `notifications` — id, user_id, type, severity, title, body, related_host_id, related_server_id, read_at, created_at
- `notification_preferences` — user_id, type, in_app_enabled, email_enabled
- `agent_updates` — id, host_id, from_version, to_version, started_at, completed_at, status, error
- `terminal_sessions` — id, host_id, user_id, started_at, ended_at, source_ip, command_count
- `waitlist_signups` — id, email, source, created_at, ip, user_agent
- `usage_metrics_daily` — user_id, date, active_hosts, active_servers, tunnel_bytes_in, tunnel_bytes_out *(groundwork for future monetization per 0.6)*

Enums: `host_status`, `server_status`, `severity`, `backup_status`, `notification_type`, `game_protocol` (tcp, udp).

---

## 5. API surface

### 5.1 User-facing (Supabase Auth session, CSRF protected)
- Auth: handled by Supabase client SDK (signup, login, logout, change password, delete account)
- `GET /api/hosts`, `GET /api/hosts/:id`, `POST /api/hosts/pair`, `PATCH /api/hosts/:id`, `DELETE /api/hosts/:id`
- `GET /api/hosts/:id/metrics`, `GET /api/hosts/:id/logs`, `GET /api/hosts/:id/game-servers`, `GET /api/hosts/:id/terminal-sessions`
- `POST /api/game-servers`, `GET /api/game-servers/:id`, `PATCH /api/game-servers/:id`, `POST /api/game-servers/:id/{start,stop,restart}`, `DELETE /api/game-servers/:id`
- `POST /api/game-servers/:id/backup`, `GET /api/game-servers/:id/backups`, `POST /api/game-servers/:id/backups/:backup_id/restore`
- `GET /api/games`, `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`, `GET /api/notification-preferences`, `PATCH /api/notification-preferences`
- `POST /api/waitlist`

### 5.2 Agent-facing (HMAC-signed with agent token)
- `WS /agent/ws` — persistent connection (heartbeat, metrics, logs, commands)
- `POST /agent/pair` — initial pairing, returns long-lived token
- `GET /agent/update-manifest` — check for agent updates
- `GET /agent/installers/:platform/:version` — signed download URLs

### 5.3 WebSocket message types (agent ↔ platform)

**Agent → Platform:** `heartbeat`, `log`, `server_status`, `deployment_progress`, `terminal_data`, `backup_progress`, `tunnel_status`

**Platform → Agent:** `deploy_server`, `start_server` / `stop_server` / `restart_server` / `delete_server`, `backup_server`, `restore_server`, `open_terminal` / `close_terminal` / `terminal_input`, `update_agent`, `reconfigure_server`, `establish_tunnel` / `teardown_tunnel`

Full message schema spec lives in `/docs/agent-protocol.md`.

---

## 6. Security checklist

- [ ] Passwords managed by Supabase Auth (argon2-equivalent)
- [ ] Agent tokens hashed in database (never stored in plaintext)
- [ ] Pairing codes single-use, 15-minute expiry
- [ ] Rate limiting: login attempts (5 per 15 min via Supabase), pairing code generation (10 per hour), API requests per agent (100/min)
- [ ] CSRF tokens on all state-changing user endpoints
- [ ] Content Security Policy headers set
- [ ] Agent WebSocket messages size-limited (1MB max), rate-limited
- [ ] Agent auth token rotation (90 days), old token valid for 24h grace period
- [ ] All blob storage URLs time-limited signed (15 min)
- [ ] Game server processes run as unprivileged users, not root
- [ ] Firewall default-deny on agent hosts; no inbound from public internet
- [ ] No secrets in logs (sanitizer strips tokens, passwords)
- [ ] Agent-facing endpoints on separate subdomain (`agent.serverforge.gg`) with strict CORS

### 6.1 Additional hardening

- [ ] **Resource limits per game server** — cgroups v2 (memory, CPU, IO). Non-negotiable when running on users' primary hardware.
- [ ] **Command surface constraint for remote terminal (3.6)** — disabled by default per host, user opts in, every session logged with timestamps and source IP.
- [ ] **Agent update signing key** — in platform KMS (e.g., Cloudflare Workers KV with encryption, or age/sops for self-hosted), never in a repo or CI variable. Rotate annually.
- [ ] **Phase 2 — Windows Authenticode EV cert** ($300-500/year). Required for silent install UX and SmartScreen passthrough. Order 1-2 weeks before Windows launch date.
- [ ] **Threat model** in `/docs/security.md` covering: compromised platform, malicious user, compromised agent, malicious friend-who-joins.
- [ ] **User-visible audit log** per host — every platform-issued command, every terminal session, every config change.

---

## 7. Technology decisions and rationale

| Choice | Why |
|---|---|
| Next.js 16 + React 19 | Modern React, TS ergonomics, works great self-hosted via `next start` |
| Drizzle ORM (not Prisma) | Better TS inference, no codegen step, lighter runtime |
| **Supabase** (Postgres + Auth) | Free tier covers MVP, auth out of the box, managed Postgres, fast to adopt |
| WebSocket | Bidirectional, low-latency; works naturally in a long-running Node process (self-hosted) |
| Tailwind + shadcn/ui | Fast iteration, no CSS-in-JS runtime, copy-in components |
| **Go for the agent** | Single static binary, cross-compiles to Linux/Windows/macOS, strong concurrency |
| **Cloudflare Tunnel** | Free, unlimited, TCP, `cloudflared` is a Go binary that integrates naturally; same infra used to expose the platform itself |
| **Pterodactyl egg format** | Open format with large community library — we import existing eggs instead of writing templates for every game |
| **Self-hosted Docker on Unraid** | Zero additional infra cost (runs on existing hardware), persistent WebSocket server works naturally, Cloudflare Tunnel handles public exposure |
| `live-build` for ISO | Official Debian tooling, reproducible |
| xterm.js | Industry standard for browser terminals |

### 7.1 Cost-optimized infrastructure choices

Target: **under $15/year in hard infra costs** during MVP (essentially just a domain).

| Component | MVP choice | Cost |
|---|---|---|
| Web hosting | Self-hosted Docker on Unraid | $0 (existing hardware + electricity) |
| Database | Supabase free tier | $0 (500MB Postgres, auth, 2GB bandwidth) |
| Auth | Supabase Auth | $0 (bundled) |
| Blob storage | Cloudflare R2 | $0 at pre-launch volumes (zero egress fees) |
| Tunnel (platform) | Cloudflare Tunnel | $0 |
| Tunnel (game servers) | Cloudflare Tunnel | $0 |
| Domain | Porkbun or Cloudflare Registrar | ~$10-15/year for `.gg` |
| Email (transactional) | Resend free tier (3k/month) | $0 |
| Monitoring | Uptime Kuma self-hosted on Unraid + Sentry free | $0 |
| Agent update signing | age or sops with key on Unraid | $0 |
| EV code-signing cert | *Phase 2 only* | $300-500/year, deferred |

### 7.2 v2 decisions (post-MVP)

- **UDP tunnel strategy** — custom WireGuard relay on a small VPS (~$5/month). Users' agents connect to the relay; friends connect via platform hostnames that resolve to the relay. Enables Valheim/Rust/ARK/CS2/7D2D.
- **Windows agent** — see Phase 2 under 0.4. EV cert + WiX installer + silent service install.
- **Mobile/responsive dashboard**
- **Billing/monetization** — revisit per 0.6, using data from `usage_metrics_daily`

---

## 8. What's explicitly out of scope for MVP

- **Windows agent** — Phase 2, not MVP (0.4)
- **macOS agent** — future, not Phase 2
- **UDP games** (Valheim, Rust, ARK, CS2, 7 Days to Die) — v2 after custom relay
- **Billing/pricing/subscription tiers** — explicitly deferred per 0.6
- Mobile app or mobile-first dashboard (desktop-web only; responsive is a nice-to-have, not a priority)
- Team accounts / multi-user access to one account
- Public server listings / discovery
- Built-in voice chat
- Game mods / plugin management (power users use remote terminal)
- AI insights / anomaly detection
- Public API for third parties
- Webhooks
- Import from other hosting platforms

---

## 9. Branding notes (pending)

Working name: **ServerForge** (placeholder). Earlier iterations used ServerFoundary.

Guidelines for the final brand:
- Powerful but approachable — not enterprise-y
- Gaming-adjacent but not juvenile
- One or two words
- Short and `.com`/`.io`/`.gg` viable
- Premium feel — bar is Linear, Vercel, Framer, Arc, Superhuman

Color accent undecided — emerald/lime during prototyping, not locked in.

---

## 10. Development workflow for this repo

Layout:
- `/app`, `/components`, `/lib` — Next.js web app
- `/agent` — Go module (cross-compiled per platform)
- `/iso` — `live-build` config
- `/deploy` — Dockerfile, docker-compose.yml, Cloudflare Tunnel config
- `/drizzle/migrations` — schema migrations
- `/shared/types` — TypeScript types, with `quicktype` generating matching Go structs
- `/docs/decisions/` — ADRs
- Tests: Vitest (web unit), Playwright (E2E), `go test` (agent)

### Local dev
- `npm run dev` — Next.js dev server (hot reload)
- `docker-compose up` — stand up local Postgres if not using hosted Supabase, plus mock agent
- `go run ./agent` with `PAIRING_CODE=... PLATFORM_URL=http://localhost:3000` for agent dev

### Build
- `npm run build` — production web build
- `make agent-linux` / `make agent-windows` / `make agent-macos` — cross-compile agent
- `make agent` — all platforms
- `make iso` — GameServerOS (Linux host required)
- `make docker` — production Docker image of the platform

### Deploy (Unraid)
- `docker compose -f deploy/docker-compose.prod.yml pull && docker compose -f deploy/docker-compose.prod.yml up -d` — pull new image and restart
- Cloudflare Tunnel daemon runs as a separate container, pre-configured to route `serverforge.gg` → platform container:3000 and `agent.serverforge.gg` → platform container:3000
- Zero-downtime deploys via blue-green containers is a v2 concern; MVP tolerates ~30s of downtime per deploy

Commands:
- `npm run test` / `npm run test:e2e`
- `npm run db:generate` / `npm run db:migrate` — Drizzle against Supabase
- `go test ./agent/...`

---

## 11. Implementation priority order

Each step produces a working, demo-able increment. Do not move to the next step until the current one works end-to-end.

### MVP (Linux only)

1. **Repo + CLAUDE.md + Dockerfile.** Next.js scaffold. Drizzle + Supabase connection. Dockerfile that produces a runnable image.
2. **Deployment wiring.** Get the Dockerfile built and running on Unraid. Set up Cloudflare Tunnel from a test domain (even a subdomain before the real brand is picked) to the container. Prove "Next.js 'Hello World' reachable at a public URL."
3. **Auth via Supabase Auth.** Signup, login, logout, session cookies. Minimal UI.
4. **Landing page + waitlist.** Public-facing, collects emails. **Can launch publicly here** for early-access signups.
5. **Host data model + pairing code UI + Go agent skeleton.** Agent connects via WebSocket, authenticates with pairing code, sends heartbeat.
6. **Dashboard home + host list + live metrics.** Sparkline charts wired to heartbeats.
7. **Host detail (Overview tab).** Metrics history, metadata.
8. **Linux install script** (`curl | bash`). Writes systemd unit, drops binary in `/usr/local/bin/`, starts service. Tested on Debian 12 and Ubuntu 22.04/24.04 minimum.
9. **Cloudflare Tunnel integration end-to-end.** Agent spawns `cloudflared`, establishes tunnel, reports hostname; platform displays hostname. Test with a trivial HTTP server on the agent first — **gate: a friend on a different network must be able to reach the hostname**. If this doesn't work, nothing else matters.
10. **Minecraft deployment (first game).** Agent downloads server jar, writes config, starts process, registers tunnel. Full lifecycle: deploy → play → stop.
11. **Game server lifecycle controls** (start/stop/restart/delete) from dashboard.
12. **Logs** (host + server, live streaming).
13. **Remote terminal** (opt-in, audited).
14. **Notifications.**
15. **Backups.**
16. **Agent self-update.**
17. **Terraria** (second game).
18. **Security hardening pass** (nftables audit, AppArmor profiles, cgroup limits, audit log UI).
19. **GameServerOS ISO.** Power-user alternative to the install script.

**MVP critical path check**: user signs up → gets install command → runs it on Linux host → deploys Minecraft → friend on different network connects via platform hostname → sees metrics → sees logs → stops server. Nothing gets polish until this path works.

### Phase 2 (Windows)

20. **Order EV code-signing cert** (1-2 week lead time).
21. **Windows agent port.** Go agent cross-compiled to Windows; swap systemd for Windows service via `svc` package; swap AppArmor for Job Objects.
22. **WiX MSI installer.** Silent install, service configuration, pairing code entry.
23. **Authenticode signing + SmartScreen validation.**
24. **Phase 2 launch** — marketing shift from "Linux self-hosted" to "host from any gaming PC."

### v2

25. **Custom WireGuard relay** for UDP games.
26. **Valheim, Rust, ARK, CS2, 7D2D** — add as UDP relay is proven.
27. **Monetization decisions** — revisit 0.6 with real usage data.

---

## 12. Reference documents in this repo

- `README.md` — public-facing overview and install instructions
- `CLAUDE.md` — conventions, coding style, architectural decisions for AI tools (see Section 13)
- `CONTRIBUTING.md` — for external contributors (OSS status pending)
- `/docs/architecture.md` — deeper architectural diagrams
- `/docs/agent-protocol.md` — full WebSocket message spec
- `/docs/security.md` — threat model and mitigations
- `/docs/tunneling.md` — tunnel/relay provider integration
- `/docs/game-integration.md` — Pterodactyl egg format compatibility, adding new games
- `/docs/deployment.md` — Unraid + Docker + Cloudflare Tunnel deployment
- `/docs/decisions/` — one ADR per resolved decision, so AI tools don't re-explore

---

## 13. AI-assisted development strategy & cost management

Building this with AI assistance is explicitly in scope. This section is about doing that *cheaply* — maximizing what we get per dollar of Claude API / Claude Code usage.

### 13.1 Model tiering by task complexity

Use the cheapest model that can do the job well.

| Task type | Model | Rationale |
|---|---|---|
| Architecture, planning, complex debugging, security review, novel problems | **Claude Opus** | Worth the cost when the alternative is going down the wrong path |
| Most feature implementation, refactors, standard debugging, component work | **Claude Sonnet** | The workhorse — ~90% of coding work |
| Boilerplate, scaffolding, test stubs, comments, file renames, trivial edits | **Claude Haiku** | Much cheaper than Sonnet; use for anything that doesn't need reasoning |

In Claude Code, set default to Sonnet. Explicitly switch to Opus for hard problems. Route simple mechanical work through Haiku. Don't default-route everything through the most expensive model.

### 13.2 Leverage Landon's existing Unraid infrastructure

Landon has multiple Nvidia GPUs on Unraid already running Ollama (per PromptForge). Offload cheap tasks to local models:

- **Qwen 2.5 Coder 32B** or **DeepSeek Coder V2** locally for: boilerplate generation, doc drafts, regex, SQL queries, test data generation, log-file analysis, commit message drafting.
- **Claude** for: product code, architectural work, anything where a subtle error costs hours.

Rule: *if a local model gets it right 80%+ of the time and the cost of being wrong is small, use local.* For anything touching production code paths, use Claude.

### 13.3 Context management — don't pay for tokens you don't need

The single biggest cost lever.

- Maintain a `CLAUDE.md` at repo root with conventions so Claude loads it once instead of re-reading scattered files.
- Keep `/docs/decisions/` ADRs short and factual. Each is reference, not memoir.
- Use `.claudeignore` (or equivalent) to exclude `node_modules`, `dist/`, compiled binaries, generated files.
- Prefer many small files over a few monster files. When Claude needs to edit `auth.ts`, it shouldn't have to load `mega-service.ts` too.
- Use `/clear` (Claude Code) aggressively between unrelated tasks.

### 13.4 Write specs before code

Every feature gets a one-page spec *before* any implementation. Spec answers:
- What does this feature do (user-visible)?
- What files will change?
- What's the data model change (if any)?
- What's the API change (if any)?
- What's the acceptance test?

Clear spec → one coding pass. Vague spec → ten back-and-forth turns. Those ten turns cost 10× the spec.

Write specs yourself or use Claude Haiku to draft them.

### 13.5 Use cheap tools before AI

Don't ask Claude to debug what `tsc` or `eslint` will catch for free.

1. Write or generate code
2. Run `npm run lint && npm run test && npm run build` locally
3. Fix mechanical issues yourself or with Haiku
4. Only bring Sonnet/Opus in for genuine logic/design questions

### 13.6 Lean on the ecosystem

Every pre-built library, template, or component is work Claude doesn't have to do:

- **Supabase Auth** — don't roll your own auth
- **shadcn/ui** — paste components, don't generate them
- **Drizzle-kit** — generates migrations from schema
- **Next.js starter templates** and official examples — steal the boilerplate
- **Pterodactyl egg library** — import game templates instead of writing them
- **`cloudflared` Go library** — don't reimplement tunnel logic

### 13.7 Batching and session discipline

- 2-4 clear goals per Claude Code session. Finish them, commit, start fresh.
- Don't keep a session running for days — context balloons and every new message pays for the accumulated history.
- Preview large refactors with "plan mode" (ask for the plan as markdown first, approve it, then execute) — cheaper than iterating on generated code.

### 13.8 Measure and adjust

Weekly: check API usage in the Anthropic console. If any single feature blew the budget, document why in `/docs/decisions/ai-cost-learnings.md`. Was the spec vague? Wrong model? Context too large? Adjust.

---

## 14. Remaining open questions

Non-blocking for starting work, but answer when you can:

1. **Open source or closed source** — affects `CONTRIBUTING.md`, license, and whether the agent binary can bundle embedded secrets. Worth deciding before step 5 in the implementation order (agent skeleton).
2. **Launch deadline** — any self-imposed target? Affects how aggressively we cut scope. "It's ready when it's ready" is a fine answer.

**Resolved** (see Section 0):
- ~~Target audience~~ → 0.1 and 0.4 (non-technical long term, Linux hobbyists for MVP launch)
- ~~NAT traversal~~ → 0.2 (tunnel only)
- ~~Agent language~~ → 0.3 (Go)
- ~~Infrastructure hosting~~ → 0.5 (self-hosted Docker on Unraid + Supabase + Cloudflare Tunnel)
- ~~Monetization~~ → 0.6 (deferred post-MVP)
- ~~EV cert timing~~ → 0.4 / Phase 2

---

## Appendix A — Research prompt for Claude Code

Before building beyond auth, run this in Claude Code in a fresh `./research/` directory. Expects real web research and actual output files.

```markdown
# Research Brief: Self-Hosted Game Server Management Landscape

## Role
You are a product/technical researcher. Your job is to produce a thorough,
decision-ready briefing. Work iteratively — fully research one competitor
before moving to the next. Check in if you find anything that challenges
the premise.

## Background
I am building a web platform that lets Linux-comfortable users host game
servers on their own hardware (MVP), with a Phase 2 rollout to Windows
for non-technical users. NAT traversal is handled by an outbound Cloudflare
Tunnel — no port forwarding is ever required. The launch game is Minecraft
Java Edition. The platform itself runs self-hosted in Docker on my Unraid
box, exposed via Cloudflare Tunnel, with Supabase for the database.

## Research Scope

### 1. Competitor analysis
Deep-dive each of the following. For each: architecture, target user,
supported games, pricing, strengths, UX friction.
- Pterodactyl Panel (open-source, Laravel + Wings daemon)
- AMP by CubeCoders (commercial)
- Crafty Controller (Minecraft-focused, Python)
- PlayIt.gg (tunneling-as-a-service for home hosters)
- PufferPanel
- Aternos / Minecraft Realms (different model, relevant comps)
- Any other meaningful competitor you surface

### 2. Technical deep-dives
- Cloudflare Tunnel: embedding `cloudflared` in a Go process, provisioning
  hostnames programmatically, authentication options for headless use, any
  TOS gotchas for game traffic.
- Pterodactyl egg format: schema, how to import community eggs, what's
  required to run a Pterodactyl egg outside of Pterodactyl.
- Minecraft Java server orchestration: vanilla vs Paper vs Fabric vs Forge,
  Java runtime distribution, world save formats, config files.
- Linux agent install conventions: systemd best practices for long-running
  agents, user/group setup, log placement, config file locations.
- Self-hosting Next.js in Docker behind Cloudflare Tunnel: gotchas,
  WebSocket support, session cookies behind Cloudflare.

### 3. Differentiation & positioning
- For Linux hobbyists (MVP audience): what gap does this fill that
  Pterodactyl doesn't?
- For non-technical users (Phase 2 audience): what gap does this fill that
  Aternos, Minecraft Realms, and commercial hosts don't?
- Plausible business models for future monetization?

## Method
Web search liberally — docs, GitHub READMEs, r/admincraft, r/selfhosted,
YouTube walkthroughs, pricing pages. Cite source URLs inline for specific
technical claims. Favor primary sources over tutorials.

## Deliverables
Create in `./research/`:
1. `landscape.md` — competitor analysis, gap analysis, recommendation
2. `feature-matrix.md` — comparison table across ~15 dimensions
3. `cloudflare-tunnel-integration.md` — concrete implementation notes
4. `pterodactyl-egg-compatibility.md` — can we reuse the library or not?
5. `self-hosted-nextjs-unraid.md` — deployment gotchas
6. `mvp-recommendation.md` — proposed MVP scope, in/out, justification

## Success criteria
- Specific, cited claims — not vague "this tool is popular"
- Concrete enough to start building from on Monday
```

---

## Appendix B — Starting sequence

1. **Install Claude Code** and clone a fresh repo. Scaffold with `create-next-app`. Add `CLAUDE.md` at the root pointing to this file.
2. **Get the platform running on Unraid** before writing any features. Steps 1-2 from Section 11: Dockerfile, docker-compose, Cloudflare Tunnel to a test subdomain, prove a "Hello World" Next.js page is reachable from the public internet. This is genuinely the first thing — if your deployment pipeline doesn't work, nothing downstream does.
3. **Run the Appendix A research prompt** in parallel with step 2. Read the output. Update Section 14 with answers.
4. **Build auth + landing page** (steps 3-4). You can publicly announce waitlist signups here — the platform works, people just can't do anything yet.
5. **Prototype the scariest piece**: Go agent that connects outbound, spawns `cloudflared`, registers a hostname, and that a friend on another network can actually reach. No auth, no dashboard, no game server, no polish — just the core technical bet. Steps 5-9 condensed. If this works, the rest is execution.
