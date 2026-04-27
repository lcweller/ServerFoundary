/**
 * Agent self-update (PROJECT.md §3.8).
 *
 * The dashboard ships a single-file agent bundle at /agent.cjs. When an
 * agent connects with a heartbeat reporting a different `agent_version`
 * than `LATEST_AGENT_VERSION`, the ws-server dispatches `update_agent`
 * with a download URL. The agent fetches the new bundle, atomically
 * replaces its on-disk file, and exits non-zero so systemd's
 * `Restart=on-failure` policy brings it back up on the new code.
 *
 * Bumping `LATEST_AGENT_VERSION` here is the entire release control —
 * commit, deploy the dashboard, every agent picks it up on its next
 * heartbeat. Keep it in lockstep with the `AGENT_VERSION` constant in
 * `agent/agent.ts`.
 *
 * Code-signed binaries + KMS-held keys are a Phase 9 follow-on; see
 * CLAUDE.md "Known stack divergences".
 */

export const LATEST_AGENT_VERSION = "0.2.0";

/** Public URL the agent dials to fetch the new bundle. */
export function agentBundleUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (base) return `${base}/agent.cjs`;
  // Fall back to a relative path; the agent always has a configured
  // dashboardUrl so it can resolve this against its own base.
  return "/agent.cjs";
}
