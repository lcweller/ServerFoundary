import { PageHeader } from "@/components/dashboard/page-header";
import { AddHostFlow } from "./add-host-flow";

export default function NewHostPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return (
    <div>
      <PageHeader
        title="Add a Host"
        description="Give your server a name, then run one command to link it."
      />
      <AddHostFlow baseUrl={baseUrl} />
    </div>
  );
}
