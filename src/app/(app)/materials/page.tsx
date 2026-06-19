import { requireUser } from "@/lib/session";
import { isSuperAdmin } from "@/lib/user-roles";
import { PageHeader } from "@/components/ui";
import { AmmoGdriveSection } from "@/components/ammo-gdrive-section";
import { AmmoKmsSection } from "@/components/ammo-kms-section";
import { resolveKmsAmmoPageUrls } from "@/lib/ammo-config";
import { fetchAmmoGdriveFiles } from "@/lib/google-drive";
import { fetchAmmoKmsPages } from "@/lib/kms";
import { getServerI18n } from "@/lib/server-i18n";

export default async function MaterialsPage() {
  const user = await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const kmsUrls = await resolveKmsAmmoPageUrls();

  const [gdriveResult, kmsResult] = await Promise.all([
    fetchAmmoGdriveFiles(),
    fetchAmmoKmsPages(kmsUrls, user.id),
  ]);

  const isAdmin = isSuperAdmin(user);

  return (
    <div className="pb-16">
      <PageHeader title={m.materials.title} desc={m.materials.desc} />
      <div className="px-8 max-w-5xl space-y-6">
        <AmmoGdriveSection
          result={gdriveResult}
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
            files: m.materials.gdriveFileCount,
          }}
        />
        <AmmoKmsSection
          result={kmsResult}
          bcp47={bcp47}
          isAdmin={isAdmin}
          labels={{
            title: m.materials.kmsSection,
            open: m.materials.openLink,
            empty: m.materials.kmsEmpty,
            notConfigured: m.materials.kmsNotConfigured,
            kmsNotConfigured: m.materials.kmsTokenNotConfigured,
            configure: m.materials.configureInSettings,
            configureKms: m.materials.configureKmsToken,
            pages: m.materials.kmsPageCount,
            underParent: m.materials.underParent,
          }}
        />
      </div>
    </div>
  );
}
