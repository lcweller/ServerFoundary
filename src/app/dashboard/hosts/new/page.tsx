import { PageContainer, PageHeader } from "@/components/hex/page";
import { AddHostFlow } from "./add-host-flow";

export default function NewHostPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return (
    <PageContainer maxWidth={820}>
      <PageHeader
        title="Add a new host"
        subtitle="Pair a machine to run game servers. Works on any Debian-based Linux with systemd."
      />
      <AddHostFlow baseUrl={baseUrl} />
    </PageContainer>
  );
}
