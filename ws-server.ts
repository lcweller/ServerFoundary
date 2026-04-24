// Standalone WebSocket server for agent + browser-terminal connections.
// Runs alongside `next start` or `next dev`, on AGENT_WS_PORT (default 3001).
import { createServer, IncomingMessage, ServerResponse } from "http";
import { initWsServer } from "./src/lib/ws-server";
import { sendCommand, isAgentConnectedLocal } from "./src/lib/agent-hub";
import { resumeAllTunnels } from "./src/lib/tunnel-manager";
import { pruneOldMetrics } from "./src/lib/metrics";
import { db } from "./src/db";
import { hosts } from "./src/db/schema";

const port = Number(process.env.AGENT_WS_PORT ?? 3001);
const hostname = process.env.AGENT_WS_HOSTNAME ?? "0.0.0.0";
const internalKey = process.env.INTERNAL_API_KEY ?? "";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleInternalDispatch(req: IncomingMessage, res: ServerResponse) {
  const auth = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/.exec(auth);
  if (!internalKey || !match || match[1] !== internalKey) {
    res.writeHead(401);
    res.end();
    return;
  }
  const raw = await readBody(req);
  let body: { hostId?: string; command?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  const hostId = String(body.hostId ?? "");
  if (!hostId) {
    res.writeHead(400);
    res.end();
    return;
  }
  const connected = isAgentConnectedLocal(hostId);
  const delivered = connected ? sendCommand(hostId, body.command) : false;
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ delivered, connected }));
}

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  if (req.url === "/internal/dispatch" && req.method === "POST") {
    handleInternalDispatch(req, res).catch((err) => {
      console.error("[ws] /internal/dispatch error", err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

initWsServer(server);

server.listen(port, hostname, async () => {
  console.log(`[ws] listening on ${hostname}:${port}`);
  console.log(`[ws] agent endpoint:    ws://${hostname}:${port}/api/v1/agent/ws`);
  console.log(`[ws] terminal endpoint: ws://${hostname}:${port}/api/v1/terminal/<hostId>`);
  if (!internalKey) {
    console.warn("[ws] INTERNAL_API_KEY is not set — dashboard → agent commands will fail.");
  }

  // Resume every tunnel we've previously allocated. Listener binds are
  // idempotent, so if an agent reconnects before we finish here nothing
  // breaks — handleAgentConnection also calls resendTunnelsForHost.
  try {
    const rows = await db.select({ id: hosts.id }).from(hosts);
    await resumeAllTunnels(rows.map((r) => r.id));
  } catch (err) {
    console.warn("[tunnel] resumeAllTunnels failed:", (err as Error).message);
  }

  // Metrics retention — minutely >3d and hourly >30d get pruned (§3.3).
  // Run once on boot, then every 6h. Amortised cost is tiny compared to
  // the insert volume.
  const prune = async () => {
    try {
      const res = await pruneOldMetrics();
      if (res.minutelyDeleted + res.hourlyDeleted > 0) {
        console.log(
          `[metrics] pruned ${res.minutelyDeleted} minutely + ${res.hourlyDeleted} hourly rows`,
        );
      }
    } catch (err) {
      console.warn("[metrics] prune failed:", (err as Error).message);
    }
  };
  prune();
  setInterval(prune, 6 * 60 * 60 * 1000).unref();
});
