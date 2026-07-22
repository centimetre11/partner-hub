import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { SystemKmsSetup } from "../system-kms-setup";
import { SystemKnowhowSetup } from "../knowhow-setup";
import { AmmoSetup } from "../ammo-setup";
import { KMS_DEFAULT_BASE_URL } from "@/lib/kms";
import { KNOWHOW_DEFAULT_BASE_URL } from "@/lib/knowhow";
import { getAmmoConfigForClient } from "@/lib/ammo-config";
import { getServerI18n } from "@/lib/server-i18n";
import { CollapsibleCard } from "../collapsible-card";

export default async function KnowledgeSettingsPage() {
  await requireSuperAdmin();
  const { messages: m } = await getServerI18n();

  const [systemKms, systemKnowhow, ammoConfig] = await Promise.all([
    db.systemKmsCredential.findUnique({ where: { id: "singleton" } }),
    db.systemKnowhowCredential.findUnique({ where: { id: "singleton" } }),
    getAmmoConfigForClient(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{m.settings.sectionKnowledge}</h2>
        <p className="text-sm text-slate-500">{m.settings.sectionKnowledgeDesc}</p>
      </div>

      <CollapsibleCard title={m.settings.systemKmsTitle} className="lg:col-span-2">
        <SystemKmsSetup
          credential={{
            configured: !!systemKms?.accessToken,
            keyTail: systemKms?.accessToken ? systemKms.accessToken.slice(-4) : "",
            baseUrl: systemKms?.baseUrl ?? KMS_DEFAULT_BASE_URL,
            updatedAt: systemKms?.updatedAt?.toISOString(),
          }}
        />
        <p className="text-xs text-slate-500 mt-4">
          {m.settings.personalKmsHint}{" "}
          <a href="/account" className="text-sky-600 hover:underline">{m.nav.account}</a>
        </p>
      </CollapsibleCard>

      <CollapsibleCard title={m.settings.systemKnowhowTitle} className="lg:col-span-2">
        <SystemKnowhowSetup
          credential={{
            configured: !!systemKnowhow?.apiKey,
            keyTail: systemKnowhow?.apiKey ? systemKnowhow.apiKey.slice(-4) : "",
            baseUrl: systemKnowhow?.baseUrl ?? KNOWHOW_DEFAULT_BASE_URL,
            updatedAt: systemKnowhow?.updatedAt?.toISOString(),
          }}
        />
      </CollapsibleCard>

      <CollapsibleCard title={m.ammoSettings.title} className="lg:col-span-2">
        <AmmoSetup config={ammoConfig} />
      </CollapsibleCard>
    </div>
  );
}
