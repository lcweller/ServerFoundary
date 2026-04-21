# GameServerOS

A web platform that lets non-technical people host their own game servers.
Sign up, link a Linux server with one command, deploy game servers, watch
metrics, read logs, use a browser terminal — all from a dark-mode dashboard.

## Architecture

Two pieces:

- **Dashboard** — Next.js 14 (App Router) app. Postgres via Drizzle ORM.
  Email + password auth with session cookies. shadcn/ui components, Tailwind,
  dark theme.
- **Agent** — Node.js process that runs on the user's Linux server as a
  systemd service. Maintains a persistent WebSocket to the dashboard, reports
  hardware metrics, receives commands, manages game-server child processes
  via SteamCMD, handles firewall ports, provides a remote terminal.

There are three processes in production:

1. `next start` serves the dashboard HTTP on port 3000.
2. `tsx ws-server.ts` serves the agent + terminal WebSocket endpoints on
   port 3001 (configurable via `AGENT_WS_PORT`). Share the same Postgres.
3. Postgres. Provided via `docker compose up -d`.

## Local setup

```bash
cp .env.example .env
docker compose up -d           # starts Postgres
npm install
npm run db:generate            # optional, schema already checked in
npm run db:migrate
npm run db:seed                # seeds the supported-games catalog
npm run build                  # produces .next + public/agent.cjs
```

Then, in two terminals:

```bash
npm start                      # next start, port 3000
npm run start:ws               # ws-server, port 3001
```

Dev mode is `npm run dev` + `npm run dev:ws` in two terminals.

## Linking a host

From the dashboard: **Add Host → Create**. The UI generates a single install
command like:

```bash
curl -fsSL http://localhost:3000/install.sh | sudo bash -s -- http://localhost:3000 <token>
```

Paste it on a fresh Ubuntu 22.04 / 24.04 server. The script:

1. Verifies root and distro.
2. Installs `curl`, `ca-certificates`, `gnupg`, `ufw`, Node.js 18 LTS (from
   NodeSource), 32-bit libs, and SteamCMD (from multiverse; falls back to
   manual install to `/opt/steamcmd`).
3. Creates a `gameserveros` system user.
4. Downloads `agent.cjs` from `<dashboard-url>/agent.cjs`.
5. Calls `POST /api/v1/agent/enroll` with the token and stores the returned
   API key + host ID + WS URL in `/etc/gameserveros/agent.env` (mode 0600).
6. Installs `gameserveros-agent.service` (systemd unit, `Restart=on-failure`,
   `After=network-online.target`) and `systemctl enable --now`s it.
7. Enables ufw with a safe default: deny incoming, allow OpenSSH.

## Project layout

```
.
├── agent/                  # the agent source (single file, TS)
├── docker-compose.yml
├── drizzle.config.ts
├── public/
│   ├── install.sh          # one-command installer (bash)
│   └── agent.cjs           # bundled agent (produced by build:agent)
├── scripts/
│   └── build-agent.ts      # esbuild bundler for agent.cjs
├── src/
│   ├── app/                # Next.js routes (App Router)
│   ├── components/         # UI components (incl. shadcn primitives)
│   ├── db/                 # Drizzle schema + migrations
│   └── lib/                # auth, utils, agent-hub, ws-server
└── ws-server.ts            # standalone WebSocket entrypoint
```

## Scope note

This is the v0.1 — the scope defined in the original spec. Not yet built:
backups, notifications, self-update, AppArmor, ISO builder.
