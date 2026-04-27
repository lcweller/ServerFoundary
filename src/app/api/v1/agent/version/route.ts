import { NextResponse } from "next/server";
import { LATEST_AGENT_VERSION, agentBundleUrl } from "@/lib/agent-version";

export const dynamic = "force-dynamic";

/**
 * Public endpoint the agent (or install.sh) can hit to discover the
 * current recommended version + download URL. The actual update
 * dispatch happens over the agent WebSocket (see ws-server.ts).
 */
export function GET() {
  return NextResponse.json({
    version: LATEST_AGENT_VERSION,
    url: agentBundleUrl(),
  });
}
