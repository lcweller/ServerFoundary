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
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, hostname, networkInterfaces, totalmem, uptime, freemem, cpus, release, platform as osPlatform } from "os";
import { promises as fs } from "fs";
import * as net from "net";
import * as path from "path";
import WebSocket from "ws";

const AGENT_VERSION = "0.2.0";
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
  /** PROJECT.md §3.9 best-effort caps. */
  limits: { memMaxMb: number; cpuPct: number };
}

const servers = new Map<string, RunningServer>();

// --- Manifest support -------------------------------------------------------
// Each server directory gets a .gameserveros.json written at deploy time.
// On startup / reconnect the agent walks SERVERS_DIR, parses every manifest,
// and reports them to the dashboard via an "adopt_servers" message so the
// dashboard can back-populate a fresh install (e.g., host deleted and
// re-added) without the user having to rebuild each game server by hand.
const MANIFEST_NAME = ".gameserveros.json";

interface ServerManifest {
  id: string;
  name: string;
  gameId: string;
  steamAppId: number | null;
  port: number;
  startupCommand: string;
  /** PROJECT.md §3.9 best-effort caps. Optional so older manifests load. */
  limits?: { memMaxMb: number; cpuPct: number };
}

function writeManifest(dir: string, m: ServerManifest): void {
  try {
    ensureDir(dir);
    const fs = require("fs") as typeof import("fs");
    fs.writeFileSync(path.join(dir, MANIFEST_NAME), JSON.stringify(m, null, 2));
  } catch (err) {
    log("warn", `Failed to write manifest to ${dir}:`, (err as Error).message);
  }
}

function loadAllManifests(): ServerManifest[] {
  const out: ServerManifest[] = [];
  try {
    if (!existsSync(SERVERS_DIR)) return out;
    const fs = require("fs") as typeof import("fs");
    for (const entry of fs.readdirSync(SERVERS_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const mp = path.join(SERVERS_DIR, entry.name, MANIFEST_NAME);
      if (!existsSync(mp)) continue;
      try {
        const parsed = JSON.parse(readFileSync(mp, "utf8")) as ServerManifest;
        if (parsed?.id && parsed?.name && parsed?.gameId && parsed?.port) {
          out.push(parsed);
        }
      } catch (err) {
        log("warn", `Skipping unreadable manifest at ${mp}:`, (err as Error).message);
      }
    }
  } catch (err) {
    log("warn", "Failed to scan server manifests:", (err as Error).message);
  }
  return out;
}

function hydrateServersFromManifests(): void {
  for (const m of loadAllManifests()) {
    if (servers.has(m.id)) continue;
    servers.set(m.id, {
      id: m.id,
      name: m.name,
      gameId: m.gameId,
      port: m.port,
      startupCommand: m.startupCommand,
      steamAppId: m.steamAppId,
      proc: null,
      status: "stopped",
      restartAttempts: 0,
      dir: path.join(SERVERS_DIR, m.id),
      limits: m.limits ?? { memMaxMb: 4096, cpuPct: 200 },
    });
  }
}

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function portStatus(port: number): "unknown" {
  return "unknown";
}

async function openFirewallPort(port: number) {
  // The install script adds a narrow sudoers drop-in so the agent user
  // can run exactly `ufw allow <port>` and `ufw delete allow <port>`.
  // Fall through silently if ufw/sudo aren't present.
  try {
    await runCommand("sudo", ["-n", "ufw", "allow", `${port}`]);
  } catch {
    try {
      await runCommand("ufw", ["allow", `${port}`]);
    } catch {}
  }
}

async function closeFirewallPort(port: number) {
  try {
    await runCommand("sudo", ["-n", "ufw", "delete", "allow", `${port}`]);
  } catch {
    try {
      await runCommand("ufw", ["delete", "allow", `${port}`]);
    } catch {}
  }
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

/**
 * Fetch the latest Paper build for the requested Minecraft version and
 * write it to <installDir>/<target>. Uses the official PaperMC v2 API.
 */
async function downloadPaperJar(
  installDir: string,
  spec: { name: string; port: number; startupCommand: string },
  install: { target?: string; version_variable?: string },
  onLog: (line: string) => void,
): Promise<void> {
  ensureDir(installDir);
  // The MC version isn't sent separately — it's already baked into the
  // resolved startup command via {{MINECRAFT_VERSION}} substitution on the
  // server. We re-extract it from the startup command as a fallback (it
  // doesn't appear there today for Paper, so use a sensible default) or
  // from the target filename if it embeds the version.
  // Simpler: accept it via an env var on the startup command; until then,
  // hardcode the default used in seed.ts. The API route can extend the
  // message to include `install.version` later.
  const version = spec.startupCommand.match(/paper-(\d+\.\d+(?:\.\d+)?)/)?.[1]
    ?? "1.20.1";
  const target = install.target ?? "paper.jar";
  onLog(`Resolving Paper build for Minecraft ${version}`);
  const buildsRes = await fetch(
    `https://api.papermc.io/v2/projects/paper/versions/${version}/builds`,
  );
  if (!buildsRes.ok) {
    throw new Error(
      `PaperMC API returned ${buildsRes.status} for version ${version}`,
    );
  }
  const builds = (await buildsRes.json()) as {
    builds: Array<{ build: number; downloads: { application: { name: string } } }>;
  };
  const latest = builds.builds[builds.builds.length - 1];
  if (!latest) throw new Error(`No Paper builds available for ${version}`);
  const downloadName = latest.downloads.application.name;
  const url = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latest.build}/downloads/${downloadName}`;
  onLog(`Downloading Paper ${version} build ${latest.build}`);
  const dlRes = await fetch(url);
  if (!dlRes.ok) {
    throw new Error(`Paper download returned ${dlRes.status}`);
  }
  const buf = Buffer.from(await dlRes.arrayBuffer());
  const fs = require("fs") as typeof import("fs");
  fs.writeFileSync(path.join(installDir, target), buf);
  onLog(`Saved ${target} (${(buf.length / 1_048_576).toFixed(1)} MiB)`);
}

/**
 * Minimal HTTP download helper. Pulls a URL, optionally extracts a
 * .tar.gz or .zip into the install dir. Used for games that ship a
 * server bundle off Steam (Terraria, etc. — future).
 */
async function downloadHttp(
  installDir: string,
  install: {
    url: string;
    target?: string;
    extract?: "none" | "tar.gz" | "zip";
  },
  onLog: (line: string) => void,
): Promise<void> {
  ensureDir(installDir);
  onLog(`Fetching ${install.url}`);
  const res = await fetch(install.url);
  if (!res.ok) throw new Error(`Download returned ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const fs = require("fs") as typeof import("fs");
  const extract = install.extract ?? "none";
  if (extract === "none") {
    const target = install.target ?? path.basename(new URL(install.url).pathname);
    fs.writeFileSync(path.join(installDir, target), buf);
    onLog(`Saved ${target}`);
    return;
  }
  if (extract === "tar.gz") {
    const tmp = path.join(installDir, ".download.tgz");
    fs.writeFileSync(tmp, buf);
    await new Promise<void>((resolve, reject) => {
      const p = spawn("tar", ["-xzf", tmp, "-C", installDir], {
        stdio: "ignore",
      });
      p.on("error", reject);
      p.on("close", (c) =>
        c === 0 ? resolve() : reject(new Error(`tar exited ${c}`)),
      );
    });
    fs.unlinkSync(tmp);
    onLog(`Extracted tar.gz`);
    return;
  }
  if (extract === "zip") {
    const tmp = path.join(installDir, ".download.zip");
    fs.writeFileSync(tmp, buf);
    await new Promise<void>((resolve, reject) => {
      const p = spawn("unzip", ["-o", tmp, "-d", installDir], {
        stdio: "ignore",
      });
      p.on("error", reject);
      p.on("close", (c) =>
        c === 0 ? resolve() : reject(new Error(`unzip exited ${c}`)),
      );
    });
    fs.unlinkSync(tmp);
    onLog(`Extracted zip`);
    return;
  }
}

/**
 * Write the (string) files in `bootstrapFiles` to the server directory,
 * creating parent directories as needed. Used for Minecraft eula.txt and
 * a stub server.properties with the right port.
 */
async function writeBootstrapFiles(
  dir: string,
  files: Record<string, string>,
): Promise<void> {
  const fs = require("fs") as typeof import("fs");
  for (const [rel, contents] of Object.entries(files)) {
    // Guard against path traversal in an egg.
    if (rel.includes("..") || path.isAbsolute(rel)) {
      throw new Error(`Refusing to write bootstrap file at unsafe path: ${rel}`);
    }
    const full = path.join(dir, rel);
    ensureDir(path.dirname(full));
    fs.writeFileSync(full, contents);
  }
}

/**
 * Build the actual command we hand to /bin/sh, applying PROJECT.md §3.9
 * best-effort resource caps:
 *
 *   prlimit --as=<bytes> --nofile=4096   ← address-space + fd ceiling
 *   nice -n <prio>                        ← CPU priority shift
 *
 * Both ship in util-linux on every modern Linux. cpu-percent is mapped
 * to a coarse nice value: 100% → 0, 50% → 5, 25% → 10, ≥200% → -5.
 * Real cgroups v2 quota is a Phase 9.5 follow-on — see CLAUDE.md.
 */
function wrapWithLimits(cmd: string, limits: { memMaxMb: number; cpuPct: number }): string {
  const memBytes = Math.max(64, Math.floor(limits.memMaxMb)) * 1024 * 1024;
  const niceLevel =
    limits.cpuPct >= 200 ? -5 :
    limits.cpuPct >= 100 ? 0 :
    limits.cpuPct >= 50 ? 5 :
    10;
  // We can't assume prlimit / nice are on PATH on every weird host; fall
  // through to the raw command if either is missing.
  return [
    `if command -v prlimit >/dev/null 2>&1 && command -v nice >/dev/null 2>&1; then`,
    `  exec prlimit --as=${memBytes} --nofile=4096 nice -n ${niceLevel} /bin/sh -c ${shellQuote(cmd)};`,
    `else`,
    `  exec /bin/sh -c ${shellQuote(cmd)};`,
    `fi`,
  ].join(" ");
}

function shellQuote(s: string): string {
  // Single-quote with the standard '\'' escape so the inner template
  // can contain anything safely.
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function startProcess(
  server: RunningServer,
  onOutput: (line: string) => void,
): ChildProcess {
  const cmdTemplate = server.startupCommand
    .replace(/\{PORT\}/g, String(server.port))
    .replace(/\{SERVER_NAME\}/g, server.name);
  const wrapped = wrapWithLimits(cmdTemplate, server.limits);
  // Execute via /bin/sh so we get shell substitutions for the command template.
  const proc = spawn("/bin/sh", ["-c", wrapped], {
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
      this.announceAdoptions();
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

  private announceAdoptions() {
    // Report every server we have on disk so the dashboard can back-populate
    // rows that don't exist (host was deleted and re-added, or this is a
    // fresh enrollment of an agent that already has installations).
    const manifests = loadAllManifests();
    if (manifests.length === 0) return;
    log("info", `Announcing ${manifests.length} existing server(s) for adoption`);
    this.send({ type: "adopt_servers", servers: manifests });
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
        case "begin_tunnel": {
          const t = msg.tunnel as
            | { id: string; gameServerId: string; internalPort: number }
            | undefined;
          if (t) this.beginTunnel(t);
          break;
        }
        case "end_tunnel":
          this.endTunnel(String(msg.gameServerId ?? ""));
          break;
        case "tunnel_open":
          this.tunnelOpen(
            String(msg.tunnelId ?? ""),
            String(msg.connId ?? ""),
            Number(msg.internalPort ?? 0),
          );
          break;
        case "tunnel_data":
          this.tunnelData(
            String(msg.tunnelId ?? ""),
            String(msg.connId ?? ""),
            String(msg.b64 ?? ""),
          );
          break;
        case "tunnel_close":
          this.tunnelClose(
            String(msg.tunnelId ?? ""),
            String(msg.connId ?? ""),
          );
          break;
        case "backup_game_server":
          await this.backupServer(
            String(msg.gameServerId ?? ""),
            String(msg.backupId ?? ""),
          );
          break;
        case "restore_game_server":
          await this.restoreServer(
            String(msg.gameServerId ?? ""),
            String(msg.backupId ?? ""),
            String(msg.path ?? ""),
          );
          break;
        case "delete_backup":
          await this.deleteBackup(
            String(msg.gameServerId ?? ""),
            String(msg.path ?? ""),
          );
          break;
        case "update_agent":
          await this.selfUpdate(
            String(msg.url ?? ""),
            String(msg.version ?? ""),
          );
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
    port: number;
    startupCommand: string;
    /** Structured install step. Preferred over legacy steamAppId. */
    install?:
      | { kind: "paper_jar"; target?: string; version_variable?: string }
      | { kind: "steamcmd"; app_id: number }
      | {
          kind: "http_download";
          url: string;
          target?: string;
          extract?: "none" | "tar.gz" | "zip";
        }
      | null;
    /** Files written before first start, path relative to server dir. */
    bootstrapFiles?: Record<string, string>;
    /** PROJECT.md §3.9 best-effort caps; optional for legacy servers. */
    limits?: { memMaxMb: number; cpuPct: number };
    /** Legacy field — older server payloads. */
    steamAppId?: number | null;
  }) {
    const dir = path.join(SERVERS_DIR, spec.id);
    // Normalize: accept either new install spec or legacy steamAppId.
    const install =
      spec.install ??
      (spec.steamAppId != null
        ? { kind: "steamcmd" as const, app_id: spec.steamAppId }
        : null);

    const limits = spec.limits ?? { memMaxMb: 4096, cpuPct: 200 };
    const entry: RunningServer = {
      id: spec.id,
      name: spec.name,
      gameId: spec.gameId,
      port: spec.port,
      startupCommand: spec.startupCommand,
      proc: null,
      status: "installing",
      restartAttempts: 0,
      steamAppId: install?.kind === "steamcmd" ? install.app_id : null,
      dir,
      limits,
    };
    servers.set(spec.id, entry);
    writeManifest(dir, {
      id: spec.id,
      name: spec.name,
      gameId: spec.gameId,
      steamAppId: install?.kind === "steamcmd" ? install.app_id : null,
      port: spec.port,
      startupCommand: spec.startupCommand,
      limits,
    });
    this.reportStatus(entry);
    this.sendLog(spec.id, "info", "system", `Installing to ${dir}`);

    try {
      if (install?.kind === "steamcmd") {
        await downloadViaSteamCmd(dir, install.app_id, (line) => {
          this.sendLog(spec.id, "info", "system", `[steamcmd] ${line}`);
        });
      } else if (install?.kind === "paper_jar") {
        await downloadPaperJar(dir, spec, install, (line) =>
          this.sendLog(spec.id, "info", "system", `[paper] ${line}`),
        );
      } else if (install?.kind === "http_download") {
        await downloadHttp(dir, install, (line) =>
          this.sendLog(spec.id, "info", "system", `[download] ${line}`),
        );
      }
      // install is null → no-op; assume startup command self-installs.
    } catch (err) {
      entry.status = "error";
      this.reportStatus(entry);
      this.sendLog(
        spec.id,
        "error",
        "system",
        `Install failed: ${(err as Error).message}`,
      );
      return;
    }

    // Bootstrap files (eula.txt, server.properties) go down after the
    // install but before first start, so Minecraft sees them on boot.
    if (spec.bootstrapFiles) {
      try {
        await writeBootstrapFiles(dir, spec.bootstrapFiles);
      } catch (err) {
        this.sendLog(
          spec.id,
          "warn",
          "system",
          `Bootstrap file write failed: ${(err as Error).message}`,
        );
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

  /**
   * Tar.gz the server directory (excluding the backups dir itself) and
   * report size + path back to the platform. Best-effort: if tar is
   * missing or the spawn fails we still send a `failed` status so the
   * UI doesn't get stuck on "running".
   */
  private async backupServer(gameServerId: string, backupId: string) {
    const server = servers.get(gameServerId);
    if (!server || !backupId) {
      this.send({
        type: "backup_status",
        backupId,
        gameServerId,
        status: "failed",
        error: "Unknown game server",
      });
      return;
    }
    const backupsDir = path.join(server.dir, ".gameserveros-backups");
    const fileRel = `.gameserveros-backups/${backupId}.tar.gz`;
    const filePath = path.join(server.dir, fileRel);
    try {
      ensureDir(backupsDir);
    } catch (err) {
      this.send({
        type: "backup_status",
        backupId,
        gameServerId,
        status: "failed",
        error: `mkdir failed: ${(err as Error).message}`,
      });
      return;
    }
    this.send({
      type: "backup_status",
      backupId,
      gameServerId,
      status: "running",
    });
    this.sendLog(
      gameServerId,
      "info",
      "system",
      `Starting backup → ${fileRel}`,
    );
    try {
      // tar with -C parent so the archive contains <id>/... relative paths,
      // making restore back into the same directory layout trivial. Exclude
      // the backups dir itself so backups don't accumulate inside backups.
      await new Promise<void>((resolve, reject) => {
        const p = spawn(
          "tar",
          [
            "-czf",
            filePath,
            "-C",
            path.dirname(server.dir),
            "--exclude",
            `${path.basename(server.dir)}/.gameserveros-backups`,
            path.basename(server.dir),
          ],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
        p.stdout?.setEncoding("utf8");
        p.stderr?.setEncoding("utf8");
        p.stderr?.on("data", (d: string) =>
          d
            .split("\n")
            .filter(Boolean)
            .forEach((l) =>
              this.sendLog(gameServerId, "warn", "system", `[tar] ${l}`),
            ),
        );
        p.on("error", reject);
        p.on("close", (code) =>
          code === 0 ? resolve() : reject(new Error(`tar exited ${code}`)),
        );
      });
      const stat = await fs.stat(filePath);
      this.sendLog(
        gameServerId,
        "info",
        "system",
        `Backup complete (${(stat.size / 1_048_576).toFixed(1)} MiB)`,
      );
      this.send({
        type: "backup_status",
        backupId,
        gameServerId,
        status: "success",
        path: fileRel,
        sizeBytes: stat.size,
      });
    } catch (err) {
      // Clean up a half-written archive so it doesn't masquerade as a
      // valid backup later.
      try {
        await fs.unlink(filePath);
      } catch {}
      this.sendLog(
        gameServerId,
        "error",
        "system",
        `Backup failed: ${(err as Error).message}`,
      );
      this.send({
        type: "backup_status",
        backupId,
        gameServerId,
        status: "failed",
        error: (err as Error).message,
      });
    }
  }

  /**
   * Restore: stop the server, replace the data dir from the chosen tar.gz,
   * and start it back up. The tar created by `backupServer` contains the
   * server's directory at top level, so we untar from one level up.
   */
  private async restoreServer(
    gameServerId: string,
    backupId: string,
    relPath: string,
  ) {
    const server = servers.get(gameServerId);
    if (!server || !relPath) {
      this.send({
        type: "backup_restore_status",
        gameServerId,
        backupId,
        status: "failed",
        error: "Unknown game server or path",
      });
      return;
    }
    const filePath = path.join(server.dir, relPath);
    if (!existsSync(filePath)) {
      this.send({
        type: "backup_restore_status",
        gameServerId,
        backupId,
        status: "failed",
        error: "Backup file not found on disk",
      });
      return;
    }
    this.sendLog(
      gameServerId,
      "info",
      "system",
      `Restore starting from ${relPath}`,
    );
    try {
      await this.stopServer(gameServerId);
      // Wait briefly so the previous process unmaps any open files.
      await new Promise((r) => setTimeout(r, 1000));
      // Move the backups dir aside so we don't clobber it during extract.
      const backupsDir = path.join(server.dir, ".gameserveros-backups");
      const stash = path.join(
        path.dirname(server.dir),
        `.${path.basename(server.dir)}.backups.${Date.now()}`,
      );
      let moved = false;
      try {
        await fs.rename(backupsDir, stash);
        moved = true;
      } catch {}
      // Wipe the dir (preserving the directory itself) by rm + mkdir.
      // (The tar contains the dir at top level, so extraction recreates it.)
      try {
        await fs.rm(server.dir, { recursive: true, force: true });
      } catch {}
      ensureDir(server.dir);
      await new Promise<void>((resolve, reject) => {
        const p = spawn(
          "tar",
          ["-xzf", filePath, "-C", path.dirname(server.dir)],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
        p.on("error", reject);
        p.on("close", (code) =>
          code === 0 ? resolve() : reject(new Error(`tar exited ${code}`)),
        );
      });
      // Restore the previously-stashed backups dir on top of the
      // freshly-extracted tree so we don't lose backup history.
      if (moved) {
        try {
          // Remove the backups dir from the just-extracted tarball if any
          // (tar excluded it, but be defensive) and move the stash back.
          await fs.rm(backupsDir, { recursive: true, force: true });
          await fs.rename(stash, backupsDir);
        } catch (err) {
          log(
            "warn",
            `Failed to reattach backups dir during restore:`,
            (err as Error).message,
          );
        }
      }
      this.send({
        type: "backup_restore_status",
        gameServerId,
        backupId,
        status: "success",
      });
      this.sendLog(gameServerId, "info", "system", `Restore complete; restarting`);
      await this.startServer(gameServerId);
    } catch (err) {
      this.sendLog(
        gameServerId,
        "error",
        "system",
        `Restore failed: ${(err as Error).message}`,
      );
      this.send({
        type: "backup_restore_status",
        gameServerId,
        backupId,
        status: "failed",
        error: (err as Error).message,
      });
    }
  }

  private async deleteBackup(gameServerId: string, relPath: string) {
    const server = servers.get(gameServerId);
    if (!server || !relPath) return;
    // Refuse to follow paths that escape the server dir.
    if (relPath.includes("..") || path.isAbsolute(relPath)) {
      log("warn", `Refusing to delete backup at unsafe path: ${relPath}`);
      return;
    }
    const filePath = path.join(server.dir, relPath);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      log(
        "warn",
        `Failed to delete backup ${filePath}:`,
        (err as Error).message,
      );
    }
  }

  /**
   * Self-update flow (PROJECT.md §3.8).
   *
   * 1. Resolve absolute URL against the configured dashboard URL if the
   *    server sent us a relative one.
   * 2. Download to a sibling tmp file in the same directory so the final
   *    rename is atomic on Linux.
   * 3. Sanity-check the bundle (non-empty, looks like JS).
   * 4. Keep the previous bundle as `.prev` so a manual rollback is one
   *    `mv` away.
   * 5. Report success then exit non-zero so the existing systemd unit's
   *    `Restart=on-failure` brings us back up on the new bundle.
   */
  private async selfUpdate(url: string, version: string) {
    if (!url) return;
    // process.argv[1] is the path systemd invoked us with — i.e., our
    // own bundle. Refuse to overwrite anything else.
    const target = process.argv[1];
    if (!target || !target.endsWith("agent.cjs")) {
      log("error", "Refusing self-update: argv[1] is not agent.cjs:", target);
      this.send({
        type: "agent_update_status",
        status: "failed",
        version,
        error: "argv[1] is not agent.cjs",
      });
      return;
    }
    const absUrl = url.startsWith("http")
      ? url
      : `${this.config.dashboardUrl.replace(/\/$/, "")}${
          url.startsWith("/") ? url : `/${url}`
        }`;
    log("info", `Self-update: fetching ${absUrl} (target ${version})`);
    this.send({
      type: "agent_update_status",
      status: "started",
      version,
    });
    try {
      const res = await fetch(absUrl);
      if (!res.ok) {
        throw new Error(`download returned HTTP ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) {
        throw new Error(`bundle suspiciously small (${buf.length} bytes)`);
      }
      const head = buf.slice(0, 256).toString("utf8");
      if (!/(?:require|module\.exports|"use strict"|var |const |function )/.test(head)) {
        throw new Error("bundle does not look like a JS file");
      }
      const dir = path.dirname(target);
      const tmp = path.join(dir, `.agent.cjs.new.${process.pid}`);
      const prev = path.join(dir, "agent.cjs.prev");
      const fsSync = require("fs") as typeof import("fs");
      fsSync.writeFileSync(tmp, buf, { mode: 0o755 });
      // Best-effort copy of current bundle to .prev for manual rollback.
      try {
        fsSync.copyFileSync(target, prev);
      } catch (err) {
        log("warn", `Could not snapshot previous agent:`, (err as Error).message);
      }
      // Atomic rename on Linux when src/dst are on the same filesystem.
      fsSync.renameSync(tmp, target);
      log("info", `Self-update: swapped to v${version}; restarting`);
      this.send({
        type: "agent_update_status",
        status: "success",
        version,
      });
      // Give the WS frame a moment to flush before we tear down.
      setTimeout(() => process.exit(75 /* EX_TEMPFAIL → systemd restarts */), 500);
    } catch (err) {
      log("error", "Self-update failed:", (err as Error).message);
      this.send({
        type: "agent_update_status",
        status: "failed",
        version,
        error: (err as Error).message,
      });
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

  // ---- Tunnel (ADR 0001 Option A) ------------------------------------
  //
  // Platform -> agent for lifecycle:
  //   begin_tunnel      bind tunnel { id, gameServerId, internalPort }
  //   end_tunnel        drop tunnel for gameServerId + close all socks
  // Platform -> agent for traffic:
  //   tunnel_open       { tunnelId, connId, internalPort } → dial localhost
  //   tunnel_data       { tunnelId, connId, b64 }         → write to socket
  //   tunnel_close      { tunnelId, connId }              → destroy socket
  // Agent -> platform for traffic: same tunnel_data / tunnel_close shapes.

  private tunnelInternalPort = new Map<string, number>(); // tunnelId -> port
  private tunnelOfServer = new Map<string, string>(); // gameServerId -> tunnelId
  private tunnelSockets = new Map<string, Map<string, net.Socket>>(); // tunnelId -> connId -> socket

  private beginTunnel(t: {
    id: string;
    gameServerId: string;
    internalPort: number;
  }) {
    this.tunnelInternalPort.set(t.id, t.internalPort);
    this.tunnelOfServer.set(t.gameServerId, t.id);
    if (!this.tunnelSockets.has(t.id)) this.tunnelSockets.set(t.id, new Map());
  }

  private endTunnel(gameServerId: string) {
    const tid = this.tunnelOfServer.get(gameServerId);
    if (!tid) return;
    this.tunnelOfServer.delete(gameServerId);
    this.tunnelInternalPort.delete(tid);
    const conns = this.tunnelSockets.get(tid);
    if (conns) {
      for (const s of conns.values()) {
        try {
          s.destroy();
        } catch {}
      }
      this.tunnelSockets.delete(tid);
    }
  }

  private tunnelOpen(tunnelId: string, connId: string, internalPort: number) {
    if (!tunnelId || !connId || !internalPort) return;
    const socket = net.createConnection({
      host: "127.0.0.1",
      port: internalPort,
    });
    socket.on("connect", () => {
      // no-op — first bytes either direction confirm it works
    });
    socket.on("data", (chunk) => {
      this.send({
        type: "tunnel_data",
        tunnelId,
        connId,
        b64: chunk.toString("base64"),
      });
    });
    const forwardClosed = () => {
      const m = this.tunnelSockets.get(tunnelId);
      if (!m?.delete(connId)) return;
      this.send({ type: "tunnel_close", tunnelId, connId });
    };
    socket.on("end", forwardClosed);
    socket.on("close", forwardClosed);
    socket.on("error", (err) => {
      log(
        "warn",
        `[tunnel ${tunnelId}/${connId}] dial ${internalPort} failed:`,
        err.message,
      );
    });
    let m = this.tunnelSockets.get(tunnelId);
    if (!m) {
      m = new Map();
      this.tunnelSockets.set(tunnelId, m);
    }
    m.set(connId, socket);
  }

  private tunnelData(tunnelId: string, connId: string, b64: string) {
    const sock = this.tunnelSockets.get(tunnelId)?.get(connId);
    if (!sock || sock.destroyed) return;
    try {
      sock.write(Buffer.from(b64, "base64"));
    } catch {}
  }

  private tunnelClose(tunnelId: string, connId: string) {
    const m = this.tunnelSockets.get(tunnelId);
    const sock = m?.get(connId);
    if (!sock) return;
    m!.delete(connId);
    try {
      sock.end();
    } catch {}
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
  hydrateServersFromManifests();
  if (servers.size > 0) {
    log("info", `Loaded ${servers.size} existing server(s) from disk`);
  }
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
