import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "./reset-password-form";
import { LoginLocaleSwitcher } from "@/components/locale-switcher";
import { getServerI18n } from "@/lib/server-i18n";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const { token } = await searchParams;
  const { locale, messages: m } = await getServerI18n();
  const t = m.forgotPassword;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <LoginLocaleSwitcher locale={locale} />
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-slate-900 text-white text-xl font-semibold mb-4">
            F
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{t.resetTitle}</h1>
          <p className="text-sm text-slate-500 mt-2">{t.resetDesc}</p>
        </div>
        {token ? (
          <ResetPasswordForm token={token} messages={t} />
        ) : (
          <div className="ui-card p-8 space-y-4 text-center">
            <p className="text-sm text-red-600">{t.invalidToken}</p>
            <Link href="/forgot-password" className="text-sm text-slate-800 underline-offset-2 hover:underline">
              {t.requestAgain}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
