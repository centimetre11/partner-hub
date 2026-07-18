import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { getMossConfigStatus } from "@/lib/moss";
import { isSuperAdmin } from "@/lib/user-roles";
import { getServerI18n } from "@/lib/server-i18n";
import { MossPanel } from "./moss-panel";

export default async function MossPage() {
  const user = await requireUser();
  const { messages: m } = await getServerI18n();
  const status = await getMossConfigStatus();
  const admin = isSuperAdmin(user);

  return (
    <div className="pb-16">
      <PageHeader title={m.moss.title} desc={m.moss.desc} />
      <div className="px-8 max-w-4xl">
        <MossPanel configured={status.configured} isAdmin={admin} />
      </div>
    </div>
  );
}
