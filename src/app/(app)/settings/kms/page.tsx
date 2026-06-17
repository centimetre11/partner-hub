import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { KmsSetup } from "../kms-setup";
import { KMS_DEFAULT_BASE_URL } from "@/lib/kms";

export default async function KmsSettingsPage() {
  const user = await requireUser();
  const kmsCred = await db.userKmsCredential.findUnique({ where: { userId: user.id } });

  return (
    <div className="pb-16">
      <PageHeader title="KMS document access" desc="Personal token for reading Fanruan KMS (Confluence) internal docs" />
      <div className="px-8 max-w-3xl">
        <Card title="Your KMS credentials">
          <KmsSetup
            credential={{
              configured: !!kmsCred,
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
