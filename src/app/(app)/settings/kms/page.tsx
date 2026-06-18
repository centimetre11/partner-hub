import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { KmsSetup } from "../kms-setup";
import { KMS_DEFAULT_BASE_URL } from "@/lib/kms";
import { getServerI18n } from "@/lib/server-i18n";

export default async function KmsSettingsPage() {
  const user = await requireUser();
  const { messages: m } = await getServerI18n();
  const kmsCred = await db.userKmsCredential.findUnique({ where: { userId: user.id } });

  return (
    <div className="pb-16">
      <PageHeader title={m.settings.kmsTitle} desc={m.settings.kmsDescPersonal} />
      <div className="px-8 max-w-3xl">
        <Card title={m.settings.yourKms}>
          <KmsSetup
            credential={{
              configured: !!kmsCred?.accessToken,
              keyTail: kmsCred?.accessToken ? kmsCred.accessToken.slice(-4) : "",
              baseUrl: kmsCred?.baseUrl ?? KMS_DEFAULT_BASE_URL,
              updatedAt: kmsCred?.updatedAt.toISOString(),
            }}
          />
        </Card>
      </div>
    </div>
  );
}
