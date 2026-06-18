import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { LoginLocaleSwitcher } from "@/components/locale-switcher";
import { getServerI18n } from "@/lib/server-i18n";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const firstRun = (await db.user.count()) === 0;
  const { locale, messages: m } = await getServerI18n();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-amber-50 px-4">
      <div className="w-full max-w-md">
        <LoginLocaleSwitcher locale={locale} />
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white text-2xl font-bold mb-4 shadow-lg shadow-indigo-200">
            F
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">{m.login.title}</h1>
          <p className="text-sm text-zinc-500 mt-2">
            {firstRun ? m.login.firstRunDesc : m.login.normalDesc}
          </p>
        </div>
        <LoginForm firstRun={firstRun} messages={m.login} />
      </div>
    </div>
  );
}
