// Standalone WebSocket server for agent + browser-terminal connections.
// Runs alongside `next start` or `next dev`, on AGENT_WS_PORT (default 3001).
import { createServer } from "http";
import { initWsServer } from "./src/lib/ws-server";

const port = Number(process.env.AGENT_WS_PORT ?? 3001);
const hostname = process.env.AGENT_WS_HOSTNAME ?? "0.0.0.0";

const server = createServer((req, res) => {
  // Health check for Kubernetes-style probes.
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

initWsServer(server);

server.listen(port, hostname, () => {
  console.log(`[ws] listening on ${hostname}:${port}`);
  console.log(`[ws] agent endpoint:    ws://${hostname}:${port}/api/v1/agent/ws`);
  console.log(`[ws] terminal endpoint: ws://${hostname}:${port}/api/v1/terminal/<hostId>`);
});
