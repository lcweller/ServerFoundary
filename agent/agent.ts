/**
 * GameServerOS agent. Runs as a systemd service on the user's Linux server.
 *
 * Responsibilities:
 *   - Maintain a WebSocket connection to the dashboard (auto-reconnect with backoff).
 *   - Every 10s, send a heartbeat with real hardware metrics.
 *   - Receive and execute commands: deploy/start/stop/restart/delete game servers,
 *     open/close/input/resize a remote terminal.
 *   - Manage game-server child processes via SteamCMD.
 *   - Manage firewall ports via ufw (best-effort).
 */

import { spawn, type ChildProcess } from "child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from "fs";
import { homedir, hostname, networkInterfaces, totalmem, uptime, freemem, cpus, release, platform as osPlatform } from "os";
import { promises as fs } from "fs";
import * as path from "path";
import WebSocket from "ws";

const AGENT_VERSION = "0.1.0";
const CONFIG_PATH = process.env.GAMESERVEROS_CONFIG ?? "/etc/gameserveros/agent.env";
const SERVERS_DIR = process.env.GAMESERVEROS_SERVERS_DIR ?? "/opt/gameserveros/servers";
const STEAMCMD = process.env.GAMESERVEROS_STEAMCMD ?? "steamcmd";

function log(level: "info" | "warn" | "error", ...parts: unknown[]) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] ${level.toUpperCase()}`;
  const line = parts
    .map((p) => (typeof p === "string" ? p : JSON.stringify(p)))
    .join(" ");
  if (level === "error") console.error(prefix, line);
  else if (level === "warn") console.warn(prefix, line);
  else console.log(prefix, line);
}

interface AgentConfig {
  dashboardUrl: string;
  apiKey: string;
  hostId: string;
  wsUrl?: string;
}

function readConfig(): AgentConfig {
  let raw: string;
  try {
    raw = readFileSync(CONFIG_PATH, "utf8");
  } catch (err) {
    log("error", `Cannot read config at ${CONFIG_PATH}:`, (err as Error).message);
    process.exit(1);
  }
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  const dashboardUrl = env.DASHBOARD_URL;
  const apiKey = env.API_KEY;
  const hostId = env.HOST_ID;
  const wsUrl = env.WS_URL;
  if (!dashboardUrl || !apiKey || !hostId) {
    log("error", `Config file ${CONFIG_PATH} is missing required values.`);
    process.exit(1);
  }
  return { dashboardUrl, apiKey, hostId, wsUrl };
}

// ---- System metrics ---------------------------------------------------------

type CpuTimes = { idle: number; total: number };
let lastCpuTimes: CpuTimes | null = null;

function readCpuTimes(): CpuTimes {
  try {
    const stat = readFileSync("/proc/stat", "utf8").split("\n")[0];
    const parts = stat.trim().split(/\s+/).slice(1).map(Number);
    const idle = parts[3] + (parts[4] ?? 0); // idle + iowait
    const total = parts.reduce((a, b) => a + (isFinite(b) ? b : 0), 0);
    return { idle, total };
  } catch {
    const c = cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of c) {
      idle += cpu.times.idle;
      total +=
        cpu.times.idle +
        cpu.times.user +
        cpu.times.sys +
        cpu.times.irq +
        cpu.times.nice;
    }
    return { idle, total };
  }
}

function cpuUsagePercent(): number {
  const curr = readCpuTimes();
  if (!lastCpuTimes) {
    lastCpuTimes = curr;
    return 0;
  }
  const dIdle = curr.idle - lastCpuTimes.idle;
  const dTotal = curr.total - lastCpuTimes.total;
  lastCpuTimes = curr;
  if (dTotal <= 0) return 0;
  return Math.max(0, Math.min(100, ((dTotal - dIdle) / dTotal) * 100));
}

function readMemInfo(): { total_gb: number; used_gb: number } {
  try {
    const raw = readFileSync("/proc/meminfo", "utf8");
    const map: Record<string, number> = {};
    for (const line of raw.split("\n")) {
      const match = /^(\w+):\s+(\d+)\s*kB/.exec(line);
      if (match) map[match[1]] = Number(match[2]) * 1024; // to bytes
    }
    const total = map.MemTotal ?? totalmem();
    const available = map.MemAvailable ?? map.MemFree ?? freemem();
    const used = Math.max(0, total - available);
    return {
      total_gb: total / 1024 ** 3,
      used_gb: used / 1024 ** 3,
    };
  } catch {
    const total = totalmem();
    const used = total - freemem();
    return { total_gb: total / 1024 ** 3, used_gb: used / 1024 ** 3 };
  }
}

async function readDiskUsage(p: string): Promise<{
  path: string;
  total_gb: number;
  used_gb: number;
}> {
  try {
    // Use statfs via node fs.statfs if available.
    const anyFs = fs as unknown as {
      statfs?: (path: string) => Promise<{
        bsize: number;
        blocks: number;
        bavail: number;
        bfree: number;
      }>;
    };
    if (anyFs.statfs) {
      const info = await anyFs.statfs(p);
      const total = info.blocks * info.bsize;
      const free = info.bavail * info.bsize;
      return {
        path: p,
        total_gb: total / 1024 ** 3,
        used_gb: (total - free) / 1024 ** 3,
      };
    }
  } catch {}
  return { path: p, total_gb: 0, used_gb: 0 };
}

function primaryNetwork(): { ip: string; interfaces: Array<{ name: string; address: string }> } {
  const all = networkInterfaces();
  const interfaces: Array<{ name: string; address: string }> = [];
  let ip = "";
  for (const [name, addrs] of Object.entries(all)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      interfaces.push({ name, address: addr.address });
      if (!ip) ip = addr.address;
    }
  }
  return { ip, interfaces };
}

function readCpuInfo(): { model: string; cores: number } {
  try {
    const raw = readFileSync("/proc/cpuinfo", "utf8");
    const match = /model name\s*:\s*(.+)/i.exec(raw);
    const model = match?.[1]?.trim() ?? cpus()[0]?.model ?? "Unknown";
    return { model, cores: cpus().length };
  } catch {
    return { model: cpus()[0]?.model ?? "Unknown", cores: cpus().length };
  }
}

function readCpuTemp(): number | null {
  const candidates = [
    "/sys/class/thermal/thermal_zone0/temp",
    "/sys/class/hwmon/hwmon0/temp1_input",
  ];
  for (const file of candidates) {
    try {
      const raw = readFileSync(file, "utf8").trim();
      const v = Number(raw);
      if (isFinite(v) && v > 0) return v / 1000;
    } catch {}
  }
  return null;
}

function readOsRelease(): { name: string; version: string } {
  try {
    const raw = readFileSync("/etc/os-release", "utf8");
    const map: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      let v = line.slice(eq + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      map[line.slice(0, eq).trim()] = v;
    }
    return { name: map.NAME ?? "Linux", version: map.VERSION_ID ?? "" };
  } catch {
    return { name: osPlatform(), version: "" };
  }
}

async function collectMetrics() {
  const [disk] = await Promise.all([readDiskUsage("/")]);
  return {
    cpu: {
      ...readCpuInfo(),
      usage: cpuUsagePercent(),
      temp: readCpuTemp(),
    },
    memory: readMemInfo(),
    disk,
    network: primaryNetwork(),
    os: { ...readOsRelease(), kernel: release() },
    uptime_seconds: Math.floor(uptime()),
    hostname: hostname(),
  };
}

// ---- Game server management -------------------------------------------------

interface RunningServer {
  id: string;
  name: string;
  gameId: string;
  port: number;
  startupCommand: string;
  proc: ChildProcess | null;
  status:
    | "queued"
    | "installing"
    | "starting"
    | "running"
    | "stopping"
    | "stopped"
    | "crashed"
    | "error";
  restartAttempts: number;
  steamAppId: number | null;
  dir: string;
}

const servers = new Map<string, RunningServer>();

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function portStatus(port: number): "unknown" {
  return "unknown";
}

async function openFirewallPort(port: number) {
  try {
    await runCommand("ufw", ["allow", `${port}`]);
  } catch {
    // ufw may not be present; non-fatal.
  }
}

async function closeFirewallPort(port: number) {
  try {
    await runCommand("ufw", ["delete", "allow", `${port}`]);
  } catch {}
}

function runCommand(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "ignore" });
    p.on("error", reject);
    p.on("close", (code) => resolve(code ?? 0));
  });
}

async function downloadViaSteamCmd(
  installDir: string,
  appId: number,
  onLog: (line: string) => void,
): Promise<void> {
  ensureDir(installDir);
  return new Promise((resolve, reject) => {
    const args = [
      "+force_install_dir",
      installDir,
      "+login",
      "anonymous",
      "+app_update",
      String(appId),
      "validate",
      "+quit",
    ];
    const p = spawn(STEAMCMD, args, { stdio: ["ignore", "pipe", "pipe"] });
    p.stdout.setEncoding("utf8");
    p.stderr.setEncoding("utf8");
    p.stdout.on("data", (d: string) =>
      d.split("\n").filter(Boolean).forEach(onLog),
    );
    p.stderr.on("data", (d: string) =>
      d.split("\n").filter(Boolean).forEach(onLog),
    );
    p.on("error", (err) => reject(err));
    p.on("close", (code) => {
      if (code === 0 || code === 6 /* Valve sometimes returns 6 on success */) {
        resolve();
      } else {
        reject(new Error(`SteamCMD exited with code ${code}`));
      }
    });
  });
}

function startProcess(
  server: RunningServer,
  onOutput: (line: string) => void,
): ChildProcess {
  const cmdTemplate = server.startupCommand
    .replace(/\{PORT\}/g, String(server.port))
    .replace(/\{SERVER_NAME\}/g, server.name);
  // Execute via /bin/sh so we get shell substitutions for the command template.
  const proc = spawn("/bin/sh", ["-c", cmdTemplate], {
    cwd: server.dir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, HOME: server.dir, LD_LIBRARY_PATH: server.dir },
  });
  proc.stdout?.setEncoding("utf8");
  proc.stderr?.setEncoding("utf8");
  proc.stdout?.on("data", (d: string) =>
    d.split("\n").filter(Boolean).forEach((l) => onOutput(l)),
  );
  proc.stderr?.on("data", (d: string) =>
    d.split("\n").filter(Boolean).forEach((l) => onOutput(l)),
  );
  return proc;
}

// ---- Dashboard connection ---------------------------------------------------

class AgentConnection {
  private ws: WebSocket | null = null;
  private config: AgentConfig;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private terminals = new Map<
    string,
    { proc: ChildProcess; cols: number; rows: number }
  >();

  constructor(config: AgentConfig) {
    this.config = config;
  }

  start() {
    this.connect();
    // Prime CPU counter.
    readCpuTimes();
  }

  private connect() {
    const url = this.buildWsUrl();
    log("info", `Connecting to ${url}`);
    const ws = new WebSocket(url, {
      headers: { authorization: `Bearer ${this.config.apiKey}` },
      perMessageDeflate: false,
    });
    this.ws = ws;

    ws.on("open", () => {
      log("info", "Connected to dashboard.");
      this.reconnectAttempts = 0;
      this.scheduleHeartbeat();
    });
    ws.on("message", (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      this.handleCommand(msg);
    });
    ws.on("close", () => {
      log("warn", "Disconnected from dashboard.");
      this.cleanup();
      this.scheduleReconnect();
    });
    ws.on("error", (err) => {
      log("error", "WebSocket error:", err.message);
    });
  }

  private buildWsUrl(): string {
    if (this.config.wsUrl) return this.config.wsUrl;
    const base = this.config.dashboardUrl.replace(/\/$/, "");
    return base.replace(/^http/, "ws") + "/api/v1/agent/ws";
  }

  private cleanup() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delays = [1000, 2000, 4000, 8000, 16000, 32000, 60000];
    const delay = delays[Math.min(this.reconnectAttempts, delays.length - 1)];
    this.reconnectAttempts++;
    log("info", `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private scheduleHeartbeat() {
    const send = async () => {
      try {
        const metrics = await collectMetrics();
        const gsState = Array.from(servers.values()).map((s) => ({
          id: s.id,
          status: s.status,
          players: 0,
          port: s.port,
        }));
        this.send({
          type: "heartbeat",
          metrics,
          agent_version: AGENT_VERSION,
          game_servers: gsState,
        });
      } catch (err) {
        log("warn", "Heartbeat failed:", (err as Error).message);
      }
    };
    send();
    this.heartbeatTimer = setInterval(send, 10_000);
  }

  send(msg: unknown) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      log("error", "Failed to send:", (err as Error).message);
    }
  }

  private async handleCommand(msg: Record<string, unknown>) {
    const type = String(msg.type ?? "");
    try {
      switch (type) {
        case "deploy_game_server":
          await this.deploy(msg.gameServer as never);
          break;
        case "start_game_server":
          await this.startServer(String(msg.gameServerId));
          break;
        case "stop_game_server":
          await this.stopServer(String(msg.gameServerId));
          break;
        case "restart_game_server":
          await this.stopServer(String(msg.gameServerId));
          await this.startServer(String(msg.gameServerId));
          break;
        case "delete_game_server":
          await this.deleteServer(String(msg.gameServerId));
          break;
        case "open_terminal":
          this.openTerminal(String(msg.sessionId));
          break;
        case "terminal_input":
          this.terminalInput(String(msg.sessionId), String(msg.data));
          break;
        case "terminal_resize":
          this.terminalResize(
            String(msg.sessionId),
            Number(msg.cols ?? 80),
            Number(msg.rows ?? 24),
          );
          break;
        case "close_terminal":
          this.closeTerminal(String(msg.sessionId));
          break;
        case "host_removed":
          log("warn", "Host was removed from dashboard. Shutting down.");
          process.exit(0);
          break;
        default:
          log("warn", "Unknown command:", type);
      }
    } catch (err) {
      log("error", `Command ${type} failed:`, (err as Error).message);
    }
  }

  private async deploy(spec: {
    id: string;
    name: string;
    gameId: string;
    steamAppId: number | null;
    port: number;
    startupCommand: string;
  }) {
    const dir = path.join(SERVERS_DIR, spec.id);
    const entry: RunningServer = {
      id: spec.id,
      name: spec.name,
      gameId: spec.gameId,
      port: spec.port,
      startupCommand: spec.startupCommand,
      proc: null,
      status: "installing",
      restartAttempts: 0,
      steamAppId: spec.steamAppId,
      dir,
    };
    servers.set(spec.id, entry);
    this.reportStatus(entry);
    this.sendLog(spec.id, "info", "system", `Installing to ${dir}`);

    if (spec.steamAppId) {
      try {
        await downloadViaSteamCmd(dir, spec.steamAppId, (line) => {
          this.sendLog(spec.id, "info", "system", `[steamcmd] ${line}`);
        });
      } catch (err) {
        entry.status = "error";
        this.reportStatus(entry);
        this.sendLog(
          spec.id,
          "error",
          "system",
          `SteamCMD failed: ${(err as Error).message}`,
        );
        return;
      }
    }

    await openFirewallPort(spec.port);
    await this.startServer(spec.id);
  }

  private async startServer(id: string) {
    const server = servers.get(id);
    if (!server) {
      log("warn", `Cannot start unknown server ${id}`);
      return;
    }
    if (server.proc && !server.proc.killed) return;
    server.status = "starting";
    this.reportStatus(server);

    server.proc = startProcess(server, (line) =>
      this.sendLog(id, "info", "game", line),
    );
    server.status = "running";
    this.reportStatus(server);
    this.sendLog(id, "info", "system", "Process started.");

    server.proc.on("exit", (code) => {
      server.proc = null;
      if (server.status === "stopping") {
        server.status = "stopped";
        this.reportStatus(server);
        this.sendLog(id, "info", "system", `Process exited (${code}).`);
        return;
      }
      // Unexpected exit.
      this.sendLog(id, "warn", "system", `Process crashed (exit ${code}).`);
      if (server.restartAttempts < 3) {
        server.restartAttempts++;
        setTimeout(() => this.startServer(id), 2000 * server.restartAttempts);
      } else {
        server.status = "crashed";
        this.reportStatus(server);
      }
    });
  }

  private async stopServer(id: string) {
    const server = servers.get(id);
    if (!server || !server.proc) return;
    server.status = "stopping";
    this.reportStatus(server);
    const proc = server.proc;
    try {
      proc.kill("SIGTERM");
    } catch {}
    const killTimer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
    }, 10_000);
    proc.on("exit", () => clearTimeout(killTimer));
  }

  private async deleteServer(id: string) {
    const server = servers.get(id);
    if (server) {
      await this.stopServer(id);
      await closeFirewallPort(server.port);
      try {
        await fs.rm(server.dir, { recursive: true, force: true });
      } catch (err) {
        log("warn", `Failed to remove ${server.dir}:`, (err as Error).message);
      }
      servers.delete(id);
    }
  }

  private reportStatus(server: RunningServer) {
    this.send({
      type: "game_server_status",
      gameServerId: server.id,
      status: server.status,
      players: 0,
    });
  }

  private sendLog(
    gameServerId: string,
    level: "info" | "warn" | "error",
    source: "system" | "agent" | "game",
    message: string,
  ) {
    this.send({ type: "log", gameServerId, level, source, message });
  }

  private openTerminal(sessionId: string) {
    if (this.terminals.has(sessionId)) return;
    // Use `script` (from util-linux, preinstalled on every Linux distro)
    // to give bash a real pseudo-terminal. Without this, interactive bash
    // whines "cannot set terminal process group" and has no job control.
    // -q: quiet   -f: flush each write   -e: propagate child exit code
    // -c: run the given command           /dev/null: don't record typescript
    const proc = spawn(
      "script",
      ["-qfec", "/bin/bash --login -i", "/dev/null"],
      {
        env: {
          ...process.env,
          TERM: "xterm-256color",
          LANG: process.env.LANG ?? "C.UTF-8",
          LC_ALL: process.env.LC_ALL ?? "C.UTF-8",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    proc.stdout?.setEncoding("utf8");
    proc.stderr?.setEncoding("utf8");
    const forward = (data: string) => {
      this.send({ type: "terminal_output", sessionId, data });
    };
    proc.stdout?.on("data", forward);
    proc.stderr?.on("data", forward);
    proc.on("exit", () => {
      this.send({ type: "terminal_closed", sessionId });
      this.terminals.delete(sessionId);
    });
    this.terminals.set(sessionId, { proc, cols: 80, rows: 24 });
    // Auto-timeout after 30 minutes of idle.
    setTimeout(() => {
      if (this.terminals.has(sessionId)) {
        log("info", `Terminal ${sessionId} timed out.`);
        this.closeTerminal(sessionId);
      }
    }, 30 * 60 * 1000);
  }

  private terminalInput(sessionId: string, data: string) {
    const term = this.terminals.get(sessionId);
    term?.proc.stdin?.write(data);
  }

  private terminalResize(sessionId: string, cols: number, rows: number) {
    const term = this.terminals.get(sessionId);
    if (!term) return;
    term.cols = cols;
    term.rows = rows;
    // Without node-pty we cannot set TIOCSWINSZ; but record anyway for logs.
  }

  private closeTerminal(sessionId: string) {
    const term = this.terminals.get(sessionId);
    if (!term) return;
    try {
      term.proc.kill("SIGTERM");
    } catch {}
    this.terminals.delete(sessionId);
  }
}

function main() {
  log("info", `GameServerOS agent v${AGENT_VERSION} starting`);
  ensureDir(SERVERS_DIR);
  const config = readConfig();
  log(
    "info",
    `Dashboard=${config.dashboardUrl} host=${config.hostId}`,
  );
  const conn = new AgentConnection(config);
  conn.start();

  const shutdown = (sig: string) => {
    log("info", `Received ${sig}, exiting.`);
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("uncaughtException", (err) => {
    log("error", "Uncaught exception:", err.stack ?? err.message);
  });
  process.on("unhandledRejection", (err) => {
    log("error", "Unhandled rejection:", String(err));
  });
}

main();
