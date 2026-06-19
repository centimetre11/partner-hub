import { requireUser } from "@/lib/session";
import { isSuperAdmin } from "@/lib/user-roles";
import { PageHeader } from "@/components/ui";
import { AmmoGdriveSection } from "@/components/ammo-gdrive-section";
import { fetchAmmoGdriveBrowse } from "@/lib/google-drive";
import { getServerI18n } from "@/lib/server-i18n";

export default async function MaterialsPage() {
  const user = await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const gdriveResult = await fetchAmmoGdriveBrowse();
  const isAdmin = isSuperAdmin(user);

  return (
    <div className="pb-16">
      <PageHeader title={m.materials.title} desc={m.materials.desc} />
      <div className="px-8 max-w-5xl">
        <AmmoGdriveSection
          initialResult={gdriveResult}
          bcp47={bcp47}
          isAdmin={isAdmin}
          labels={{
            title: m.materials.gdriveSection,
            openFolder: m.materials.openFolder,
            openFile: m.materials.openLink,
            empty: m.materials.gdriveEmpty,
            notConfigured: m.materials.gdriveNotConfigured,
            missingCredentials: m.materials.gdriveMissingCredentials,
            configure: m.materials.configureInSettings,
            summary: m.materials.gdriveSummary,
            root: m.materials.gdriveRoot,
            loading: m.materials.gdriveLoading,
          }}
        />
      </div>
    </div>
  );
}
