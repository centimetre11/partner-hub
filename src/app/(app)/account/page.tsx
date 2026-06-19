import { requireUser } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { KmsSetup } from "../settings/kms-setup";
import { ProfileSetup } from "./profile-setup";
import { PasswordSetup } from "./password-setup";
import { UserIdentitySetup } from "@/components/user-identity-setup";
import { getKmsConfigStatus, getUserKmsCredential, KMS_DEFAULT_BASE_URL } from "@/lib/kms";
import { getCrmSalesmenAction } from "@/lib/crm-actions";
import { db } from "@/lib/db";
import { getServerI18n } from "@/lib/server-i18n";

export default async function AccountPage() {
  const user = await requireUser();
  const { messages: m } = await getServerI18n();
  const kms = await getKmsConfigStatus(user.id);
  const personalKms = await getUserKmsCredential(user.id);
  const freshUser = await db.user.findUnique({
    where: { id: user.id },
    select: { crmSalesmanName: true, wecomUserId: true, wecomDisplayName: true, name: true },
  });
  const salesmen = await getCrmSalesmenAction();
  const am = m.account;

  return (
    <div className="pb-16">
      <PageHeader title={am.title} desc={am.desc} />
      <div className="px-8 max-w-3xl space-y-6">
        <Card title={am.profile}>
          <ProfileSetup
            name={user.name}
            email={user.email}
            labels={{
              displayName: am.displayName,
              email: am.email,
              emailHint: am.emailHint,
              save: m.common.save,
            }}
          />
        </Card>

        <Card title={am.password}>
          <PasswordSetup
            labels={{
              current: am.currentPassword,
              newPassword: am.newPassword,
              confirm: am.confirmPassword,
              save: am.changePassword,
            }}
          />
        </Card>

        <Card title={am.kmsTitle} className="lg:col-span-2">
          <div className="space-y-3">
            {kms.configured && kms.fallback && !kms.personal && (
              <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
                {am.kmsUsingFallback.replace(
                  "{source}",
                  kms.source === "env"
                    ? am.kmsSourceEnv
                    : kms.source === "admin"
                      ? am.kmsSourceAdmin
                      : am.kmsSourceSystem,
                )}
              </div>
            )}
            {kms.personal && (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
                {am.kmsPersonalConfigured}
              </div>
            )}
            <KmsSetup
              credential={{
                configured: kms.personal,
                keyTail: kms.personal ? kms.keyTail ?? "" : "",
                baseUrl: kms.baseUrl ?? KMS_DEFAULT_BASE_URL,
                updatedAt: personalKms?.updatedAt.toISOString(),
              }}
            />
            <p className="text-xs text-zinc-500 leading-relaxed">{am.kmsFallbackHint}</p>
          </div>
        </Card>

        <Card title={am.identityTitle}>
          <UserIdentitySetup
            hubName={freshUser?.name ?? user.name}
            wecomUserId={freshUser?.wecomUserId ?? null}
            wecomDisplayName={freshUser?.wecomDisplayName ?? null}
            crmSalesmanName={freshUser?.crmSalesmanName ?? null}
            salesmen={salesmen}
          />
        </Card>
      </div>
    </div>
  );
}
