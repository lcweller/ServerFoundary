# ADR 0001 — Game traffic transport for the MVP

Status: **accepted — Option A shipped**
Supersedes: nothing
Related: PROJECT.md §0.2, §2.4, §3.5, §7.2, §11 step 9

## Context

PROJECT.md §0.2 is an architectural hard rule: **the product must never require
port forwarding on the user's home router**. All game traffic reaches the
host via an outbound tunnel established by the agent.

PROJECT.md §2.4 picks Cloudflare Tunnel as the MVP transport:

> MVP provider: Cloudflare Tunnel. Free, unlimited, TCP-only. The agent
> embeds or downloads `cloudflared` and provisions a hostname per game
> server.

This phrasing overstates what Cloudflare Tunnel actually does on the free
tier. The specifics matter:

- **Cloudflare Tunnel + public hostname** works out of the box for
  HTTP/HTTPS. A DNS CNAME points `mc.example.com` at the tunnel UUID;
  Cloudflare's edge proxies `:80`/`:443` traffic through the tunnel to
  the origin. Perfect for the dashboard, already in use for
  `game.layeroneconsultants.com`.
- **Arbitrary TCP ports** are not served by Cloudflare's public proxy on
  the free tier. A Minecraft client connecting to
  `mc.example.com:25565` hits Cloudflare edge IPs that only speak 80/443,
  and the connection is refused. TCP on arbitrary ports through the
  global proxy requires **Cloudflare Spectrum** (Enterprise plan, five
  figures per year) — out of scope per §7.1.
- **`cloudflared access tcp`** on the client side does tunnel arbitrary
  TCP, but it requires the client to install `cloudflared` and wrap their
  game-client invocation in it. Workable for a power user; unworkable for
  the non-technical persona (§0.1, §0.4).
- **DNS-only (gray cloud)** mode points the CNAME straight at the
  origin's public IP. Clients connect directly to the origin, bypassing
  Cloudflare. This works *only if* the origin exposes port 25565 to the
  public internet — i.e., port forwarding on the user's home router.
  Violates §0.2.

None of the above lets a vanilla Minecraft client on Alice's home
network reach Bob's home-hosted Minecraft server over Cloudflare Tunnel
free. PROJECT.md's MVP architecture, taken literally, can't pass §11's
critical-path test (*"a friend on a different network must be able to
reach the hostname"*).

§7.2 acknowledges this for UDP ("custom WireGuard relay on a small
VPS") but assumes TCP is handled. It isn't.

## Options

### Option A — In-container TCP relay over the existing WebSocket

Pull §7.2's relay architecture forward to the MVP, minus the VPS. The
platform's `ws-server` process adds a public TCP listener bound to a
port range (e.g., `30000–30099`). Each game server deployment gets an
external port from the pool. The agent opens a logical TCP tunnel
through the existing WebSocket (frames multiplexed by `connection_id`);
the relay proxies TCP bytes between the public port and the WebSocket
frames.

Players connect to `game.layeroneconsultants.com:30027`.

**Pros**
- Zero new infra, $0 monthly cost (§0.5, §7.1).
- Works for any TCP game today — Minecraft and Terraria out of the box.
- Reuses the already-authenticated agent WebSocket; no new trust channel.
- When §7.2 ships WireGuard for UDP, the public-address abstraction stays
  the same — only the transport swaps.

**Cons**
- **One-time port forward on the platform operator's router** for the
  relay range. This is Landon's home ISP, not end users'. §0.2 forbids
  port forwarding *for users*, not for the platform operator's own
  self-hosted infrastructure. The same pragmatic concession already
  applies to the dashboard's Cloudflare Tunnel — it runs on an Unraid
  box behind that router.
- Bandwidth ceiling = operator's home uplink. Fine for a dozen Minecraft
  servers. Will need the VPS relay (Option B) once usage grows.
- Doesn't solve UDP — still needs §7.2 for Valheim/Rust/etc.

### Option B — VPS-based relay now

Stand up a cheap VPS (~$5/month), run an SSH or WireGuard-plus-sidecar
relay there. Agents connect outbound to the VPS; players connect to
`game.serverforge.gg` which resolves to the VPS.

**Pros**
- No port forwarding on the operator's side at all.
- Generalizes to UDP immediately (WireGuard).
- Better bandwidth headroom than Landon's uplink.

**Cons**
- $5/month recurring. Violates the $15/year target in §7.1 unless you
  accept the bump.
- Second piece of infra to learn/operate.
- More code — WireGuard client management, relay port allocation, DNS
  automation.

### Option C — Per-server Cloudflare Tunnel hostname, HTTP/S only

Literally what §2.4 describes: `cloudflared` sidecar per game server,
public hostname via Cloudflare DNS API. Works only for games that speak
HTTP (game web admin panels, REST-based games — basically nothing in the
MVP catalog).

Leaves Minecraft in "how do I connect?" limbo. Not viable for the MVP
critical path.

## Decision

**Option A — in-container TCP relay through the existing agent WebSocket.**

Consistent with §0.5 ("self-hosted on Unraid, zero additional infra cost")
and §7.1 (<$15/year hard infra budget). The relay multiplexes many TCP
connections per agent over the already-authenticated WebSocket; no new
trust channel is introduced.

When the v2 WireGuard relay lands (§7.2) it will plug in as a second
`provider` in the `tunnels` table. The game-server deploy flow, UI, and
agent code do not need to change for that swap — only the specific
`beginTunnel` / `endTunnel` implementation that backs a given provider.

## Consequences (for Option A, if chosen)

- New dependency: a TCP-over-WebSocket multiplexer on both ends.
  Implementation is straightforward but non-trivial — probably 300-500
  lines across agent + ws-server.
- `tunnels` table tracks per-server external_port assignment and
  persists across restarts.
- Operator documentation: one-time port-forward on the router; firewall
  rule on Unraid to accept the relay range.
- UI: each game server gets a *Public address* field showing the
  relay host:port that players connect to.
- Known limitations to document on the "Add Host" page and the Public
  Address hover: *"Available only for TCP games until the v2 relay
  lands"*.

## Scaffolding done before decision

Independent of which option is chosen, the data model is identical:

- `tunnels` table per PROJECT.md §4
- `game_servers` joined to `tunnels` for display

Shipped in the same PR as this ADR so the UI has somewhere to hang the
"Public address" row.

## Implementation notes (Option A)

Ports and code:

- `src/lib/tunnels.ts` — allocator. Picks the lowest free port in
  `[EXTERNAL_PORT_START, EXTERNAL_PORT_START + EXTERNAL_PORT_COUNT - 1]`
  per config. Default 30000-30099.
- `src/lib/tunnel-manager.ts` — server-side multiplexer. One TCP
  listener per tunnel. Per-conn `connId` keys track inbound sockets.
  Bytes forward over the existing agent WS as `tunnel_*` messages.
  Listeners re-bind on ws-server startup via `resumeAllTunnels`, and on
  every agent reconnect the platform resends `begin_tunnel` for each of
  the host's tunnels (`resendTunnelsForHost`).
- `agent/agent.ts` — mirror handlers. On `tunnel_open`, dials
  `localhost:<internal>` and pipes bytes both ways.
- `src/app/api/hosts/[id]/game-servers/route.ts` — on deploy, allocates
  a tunnel row, dispatches `begin_tunnel` alongside `deploy_game_server`.
- `src/app/api/game-servers/[id]/route.ts` — on delete, dispatches
  `end_tunnel` and lets the ON DELETE CASCADE on gameServerId clean up
  the tunnels row.

Message schema (all JSON over the existing WS):

    platform → agent
      begin_tunnel     { tunnel: { id, gameServerId, internalPort } }
      end_tunnel       { gameServerId }
      tunnel_open      { tunnelId, connId, internalPort }
      tunnel_data      { tunnelId, connId, b64 }
      tunnel_close     { tunnelId, connId }

    agent → platform
      tunnel_data      { tunnelId, connId, b64 }
      tunnel_close     { tunnelId, connId }

Payloads are base64 JSON for now — uniform with the rest of our agent
protocol. Binary WS frames are an optimisation if profiling shows the
~33 % b64 bloat matters; Minecraft traffic volume is well under that
concern.

Operator requirements:

- One-time port-forward on the Unraid router for the relay range
  (default `30000-30099` TCP). Required so a friend on a different
  network can reach a hosted Minecraft server.
- `INTERNAL_API_KEY` env var set to any long random string and
  identical across the Next.js process and ws-server process so
  cross-process dispatch works.

Known limitations:

- TCP only. UDP games wait on §7.2's WireGuard relay.
- Bandwidth ceiling = the operator's home uplink. Fine for a dozen
  Minecraft servers; the VPS alternative (Option B) is the upgrade path
  once that's insufficient.
- Agent restarts drop all active connections. Players reconnect; the
  resync handshake on reconnect doesn't try to preserve TCP state
  (which we can't, anyway).
