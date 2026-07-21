import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "./forgot-password-form";
import { LoginLocaleSwitcher } from "@/components/locale-switcher";
import { getServerI18n } from "@/lib/server-i18n";

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");
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
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{t.title}</h1>
          <p className="text-sm text-slate-500 mt-2">{t.desc}</p>
        </div>
        <ForgotPasswordForm messages={t} />
      </div>
    </div>
  );
}
