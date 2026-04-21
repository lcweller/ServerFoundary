import { PageHeader } from "@/components/dashboard/page-header";
import { requireUser } from "@/lib/auth";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your profile, password, and account."
      />
      <SettingsForm
        user={{ id: user.id, name: user.name, email: user.email }}
      />
    </div>
  );
}
