import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { getKnowhowConfigStatus } from "@/lib/knowhow";
import { isSuperAdmin } from "@/lib/user-roles";
import { getServerI18n } from "@/lib/server-i18n";
import { KnowhowSearchPanel } from "./knowhow-search-panel";

export default async function KnowhowPage() {
  const user = await requireUser();
  const { messages: m } = await getServerI18n();
  const status = await getKnowhowConfigStatus();
  const admin = isSuperAdmin(user);

  return (
    <div className="pb-16">
      <PageHeader title={m.knowhow.title} desc={m.knowhow.desc} />
      <div className="px-8 max-w-4xl">
        <KnowhowSearchPanel configured={status.configured} isAdmin={admin} />
      </div>
    </div>
  );
}
