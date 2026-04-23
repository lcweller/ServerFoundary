"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HxCard } from "@/components/hex/card";
import { HxButton } from "@/components/hex/button";

const field = {
  className: "h-9 w-full rounded-lg border px-3 text-[13.5px] outline-none",
  style: {
    background: "var(--hx-bg)",
    borderColor: "var(--hx-border)",
    color: "var(--hx-fg)",
  } as React.CSSProperties,
};

export function SettingsForm({
  user,
}: {
  user: { id: string; name: string; email: string };
}) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  const [deleting, setDeleting] = useState(false);

  async function saveProfile() {
    setSavingProfile(true);
    setProfileMsg(null);
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setSavingProfile(false);
    if (res.ok) {
      setProfileMsg("Saved.");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setProfileMsg(data.error ?? "Couldn't save.");
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwMsg(null);
    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPwError("Password must be at least 8 characters.");
      return;
    }
    setSavingPw(true);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setSavingPw(false);
    if (res.ok) {
      setPwMsg("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      const data = await res.json().catch(() => ({}));
      setPwError(data.error ?? "Couldn't change password.");
    }
  }

  async function deleteAccount() {
    if (!confirm("Delete your account permanently? This cannot be undone."))
      return;
    setDeleting(true);
    const res = await fetch("/api/account", { method: "DELETE" });
    if (res.ok) {
      router.push("/");
      router.refresh();
    }
    setDeleting(false);
  }

  return (
    <div className="flex flex-col gap-[var(--hx-gap-md)]">
      <HxCard padding={20}>
        <div className="mb-3 text-[14px] font-medium">Profile</div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="hx-mono-tag text-[var(--hx-muted-fg)]">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              {...field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="hx-mono-tag text-[var(--hx-muted-fg)]">Email</span>
            <input value={user.email} disabled {...field} />
          </label>
          <div className="flex items-center gap-3">
            <HxButton
              variant="secondary"
              disabled={savingProfile || name === user.name}
              onClick={saveProfile}
            >
              Save changes
            </HxButton>
            {profileMsg && (
              <span className="text-[12.5px] text-[var(--hx-muted-fg)]">
                {profileMsg}
              </span>
            )}
          </div>
        </div>
      </HxCard>

      <HxCard padding={20}>
        <div className="mb-3 text-[14px] font-medium">Password</div>
        <form onSubmit={changePassword} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="hx-mono-tag text-[var(--hx-muted-fg)]">
              Current password
            </span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              {...field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="hx-mono-tag text-[var(--hx-muted-fg)]">
              New password
            </span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              {...field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="hx-mono-tag text-[var(--hx-muted-fg)]">
              Confirm new password
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              {...field}
            />
          </label>
          {pwError && (
            <div
              className="rounded-lg border px-3 py-2 text-[12.5px]"
              style={{
                background:
                  "color-mix(in oklch, var(--hx-err) 10%, transparent)",
                borderColor:
                  "color-mix(in oklch, var(--hx-err) 30%, transparent)",
                color: "var(--hx-err)",
              }}
            >
              {pwError}
            </div>
          )}
          {pwMsg && (
            <div
              className="rounded-lg border px-3 py-2 text-[12.5px]"
              style={{
                background:
                  "color-mix(in oklch, var(--hx-ok) 10%, transparent)",
                borderColor:
                  "color-mix(in oklch, var(--hx-ok) 30%, transparent)",
                color: "var(--hx-ok-fg)",
              }}
            >
              {pwMsg}
            </div>
          )}
          <div>
            <HxButton type="submit" variant="secondary" disabled={savingPw}>
              Change password
            </HxButton>
          </div>
        </form>
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
          Deleting your account permanently removes your hosts, game servers,
          and credentials.
        </div>
        <HxButton
          variant="danger"
          icon="trash"
          disabled={deleting}
          onClick={deleteAccount}
        >
          Delete account
        </HxButton>
      </HxCard>
    </div>
  );
}
