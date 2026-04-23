"use client";

import { useState } from "react";
import type { Host } from "@/db/schema";
import { HxCard } from "@/components/hex/card";
import { HxButton } from "@/components/hex/button";

export function SettingsTab({
  host,
  onDelete,
}: {
  host: Host;
  onDelete: () => void;
}) {
  const [name, setName] = useState(host.name);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/hosts/${host.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="flex flex-col gap-[var(--hx-gap-md)]">
      <HxCard padding={20}>
        <div className="mb-3 text-[14px] font-medium">Host name</div>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 flex-1 rounded-lg border px-3 text-[13.5px]"
            style={{
              background: "var(--hx-bg)",
              borderColor: "var(--hx-border)",
              color: "var(--hx-fg)",
            }}
          />
          <HxButton
            variant="secondary"
            disabled={saving || name === host.name}
            onClick={save}
          >
            {saved ? "Saved" : "Save"}
          </HxButton>
        </div>
        <div className="mt-2 text-[12px] text-[var(--hx-muted-fg)]">
          Used as the label in the dashboard and on this host&apos;s logs.
        </div>
      </HxCard>

      <HxCard padding={20}>
        <div className="mb-3 text-[14px] font-medium">Agent</div>
        <div className="grid items-center gap-3 text-[13px]" style={{ gridTemplateColumns: "1fr auto" }}>
          <div>
            <div>
              Running{" "}
              <span className="font-mono">
                {host.agentVersion ? `v${host.agentVersion}` : "—"}
              </span>
            </div>
            <div className="mt-0.5 text-[12px] text-[var(--hx-muted-fg)]">
              Agents self-update from the dashboard&apos;s{" "}
              <span className="font-mono">/agent.cjs</span>. Run the install
              command again to force an update.
            </div>
          </div>
        </div>
      </HxCard>

      <HxCard
        padding={20}
        style={{
          borderColor:
            "color-mix(in oklch, var(--hx-err) 40%, var(--hx-border))",
        }}
      >
        <div
          className="mb-1 text-[14px] font-medium"
          style={{ color: "var(--hx-err)" }}
        >
          Danger zone
        </div>
        <div className="mb-3 text-[13px] text-[var(--hx-muted-fg)]">
          Removing this host will stop all game servers running on it and
          unenroll the agent. Server data is preserved on disk.
        </div>
        <HxButton variant="danger" icon="trash" onClick={onDelete}>
          Remove host
        </HxButton>
      </HxCard>
    </div>
  );
}
