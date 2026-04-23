import { PageContainer, PageHeader } from "@/components/hex/page";
import { requireUser } from "@/lib/auth";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <PageContainer maxWidth={820}>
      <PageHeader
        title="Settings"
        subtitle="Your profile, password, and account."
      />
      <SettingsForm user={{ id: user.id, name: user.name, email: user.email }} />
    </PageContainer>
  );
}
