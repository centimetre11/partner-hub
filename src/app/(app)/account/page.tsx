import { requireUser } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { FeedbackList } from "../settings/feedback-list";
import { KmsSetup } from "../settings/kms-setup";
import { ProfileSetup } from "./profile-setup";
import { PasswordSetup } from "./password-setup";
import { UserIdentitySetup } from "@/components/user-identity-setup";
import { GoogleMeetSetup } from "@/components/google-meet-setup";
import { getKmsConfigStatus, getUserKmsCredential, KMS_DEFAULT_BASE_URL } from "@/lib/kms";
import { getUserGoogleMeetStatus } from "@/lib/google-meet-oauth";
import { getCrmSalesmenAction } from "@/lib/crm-actions";
import { db } from "@/lib/db";
import { getServerI18n } from "@/lib/server-i18n";
import { SectionNavShell, SectionNavGroup } from "@/components/section-nav-shell";

export default async function AccountPage() {
  const user = await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const kms = await getKmsConfigStatus(user.id);
  const personalKms = await getUserKmsCredential(user.id);
  const freshUser = await db.user.findUnique({
    where: { id: user.id },
    select: { crmSalesmanName: true, wecomUserId: true, wecomDisplayName: true, name: true },
  });
  const [salesmen, myFeedback, googleMeet] = await Promise.all([
    getCrmSalesmenAction(),
    db.feedbackSubmission.findMany({
      where: { createdById: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        assets: { include: { asset: { select: { id: true, filename: true, mimeType: true, kind: true } } } },
      },
    }),
    getUserGoogleMeetStatus(user.id),
  ]);
  const am = m.account;

  const nav = [
    { id: "profile", label: am.sectionProfile },
    { id: "identity", label: am.sectionIdentity },
    { id: "google-meet", label: am.sectionGoogleMeet },
    { id: "kms", label: am.sectionKms },
    { id: "my-feedback", label: am.sectionFeedback },
  ];

  return (
    <div className="pb-16">
      <PageHeader title={am.title} desc={am.desc} />
      <SectionNavShell nav={nav} ariaLabel={am.title}>
        <SectionNavGroup id="profile" title={am.sectionProfile} desc={am.sectionProfileDesc}>
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
        </SectionNavGroup>

        <SectionNavGroup id="identity" title={am.sectionIdentity} desc={am.sectionIdentityDesc}>
          <Card title={am.identityTitle} className="lg:col-span-2">
            <UserIdentitySetup
              hubName={freshUser?.name ?? user.name}
              wecomUserId={freshUser?.wecomUserId ?? null}
              wecomDisplayName={freshUser?.wecomDisplayName ?? null}
              crmSalesmanName={freshUser?.crmSalesmanName ?? null}
              salesmen={salesmen}
            />
          </Card>
        </SectionNavGroup>

        <SectionNavGroup id="google-meet" title={am.sectionGoogleMeet} desc={am.sectionGoogleMeetDesc}>
          <Card title={am.googleMeetTitle} className="lg:col-span-2">
            <GoogleMeetSetup
              connected={googleMeet.connected}
              googleEmail={googleMeet.googleEmail}
              clientConfigured={googleMeet.clientConfigured}
            />
          </Card>
        </SectionNavGroup>

        <SectionNavGroup id="kms" title={am.sectionKms} desc={am.sectionKmsDesc}>
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
              <p className="text-xs text-slate-500 leading-relaxed">{am.kmsFallbackHint}</p>
            </div>
          </Card>
        </SectionNavGroup>

        <SectionNavGroup id="my-feedback" title={am.sectionFeedback} desc={am.sectionFeedbackDesc}>
          <Card title={m.feedback.mySubmissions} className="lg:col-span-2">
            <FeedbackList items={myFeedback} bcp47={bcp47} />
          </Card>
        </SectionNavGroup>
      </SectionNavShell>
    </div>
  );
}
