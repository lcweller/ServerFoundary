"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Host } from "@/db/schema";

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
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Host name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Created</Label>
            <Input
              value={new Date(host.createdAt).toLocaleString()}
              disabled
            />
          </div>
          <div>
            <Button onClick={save} disabled={saving || name === host.name}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saved ? "Saved!" : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">
            Danger zone
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <div className="font-medium">Remove this host</div>
            <div className="text-sm text-muted-foreground">
              Disconnects the server and deletes all data.
            </div>
          </div>
          <Button variant="destructive" onClick={onDelete}>
            Remove Host
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
