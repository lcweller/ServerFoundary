/**
 * Minimal Pterodactyl-compatible egg resolver.
 *
 * The full egg schema is large (configs, scripts, docker images, features).
 * We only read the fields we need to drive our own deploy path:
 *
 *   - startup       string  — command template, uses {{VAR}} placeholders
 *   - variables[]   list    — each with env_variable + default_value
 *   - install       object  — { kind, ... } routing to one of the agent's
 *                             built-in installers (see agent/agent.ts)
 *
 * We deliberately do NOT execute the egg's `scripts.installation` verbatim.
 * Community eggs assume a specific Docker image with specific users, and
 * running arbitrary bash pulled from an egg on a user's host is a
 * footgun. Instead, each egg maps to an install `kind` implemented in our
 * own code:
 *
 *   paper_jar      — download latest Paper build for {MINECRAFT_VERSION}
 *   steamcmd       — the existing anon SteamCMD path (app_id)
 *   http_download  — fetch a URL, optionally extract
 *
 * When we import community eggs later, we translate the parts we trust
 * (startup template, variable definitions) and reject anything that would
 * shell out. See PROJECT.md §3.5, §7, §11 step 10.
 */

export type EggVariable = {
  env_variable: string;
  default_value?: string;
};

export type EggInstallPaperJar = {
  kind: "paper_jar";
  target?: string;
  version_variable?: string; // name of the variable holding the MC version
};

export type EggInstallSteamcmd = {
  kind: "steamcmd";
  app_id: number;
};

export type EggInstallHttpDownload = {
  kind: "http_download";
  url: string;
  target?: string;
  extract?: "none" | "tar.gz" | "zip";
};

export type EggInstall =
  | EggInstallPaperJar
  | EggInstallSteamcmd
  | EggInstallHttpDownload;

export type EggJson = {
  startup: string;
  variables?: EggVariable[];
  install?: EggInstall;
  /** Files to write before first boot, keyed by relative path. */
  bootstrap_files?: Record<string, string>;
};

/**
 * Resolve an egg against a specific deployment's context:
 *   - the host- or user-provided variable overrides (empty in MVP)
 *   - the server's port + id + name, exposed as built-ins
 *
 * Returns the final shell-ready startup command and the install spec to
 * hand to the agent, plus the resolved variable map for bootstrap-file
 * substitution.
 */
export function resolveEgg(
  egg: EggJson,
  context: {
    serverId: string;
    serverName: string;
    port: number;
    overrides?: Record<string, string>;
  },
): {
  startup: string;
  install: EggInstall | null;
  variables: Record<string, string>;
  bootstrapFiles: Record<string, string>;
} {
  const vars: Record<string, string> = {
    SERVER_ID: context.serverId,
    SERVER_NAME: context.serverName,
    PORT: String(context.port),
  };
  for (const v of egg.variables ?? []) {
    if (v.default_value != null) vars[v.env_variable] = v.default_value;
  }
  for (const [k, v] of Object.entries(context.overrides ?? {})) {
    vars[k] = v;
  }

  const startup = substitute(egg.startup, vars);
  const bootstrapFiles: Record<string, string> = {};
  for (const [path, contents] of Object.entries(egg.bootstrap_files ?? {})) {
    bootstrapFiles[path] = substitute(contents, vars);
  }

  return {
    startup,
    install: egg.install ?? null,
    variables: vars,
    bootstrapFiles,
  };
}

/**
 * Replace {{VARIABLE}} occurrences with the matching value. Unknown
 * variables are left as-is so a typo in an egg is visible rather than
 * silently producing an empty string.
 */
function substitute(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match,
  );
}
