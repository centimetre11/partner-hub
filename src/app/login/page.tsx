import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { LoginLocaleSwitcher } from "@/components/locale-switcher";
import { getServerI18n } from "@/lib/server-i18n";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ wecom_oauth?: string; wecomUserId?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const firstRun = (await db.user.count()) === 0;
  const { locale, messages: m } = await getServerI18n();
  const { wecom_oauth: wecomOauthStatus, wecomUserId } = await searchParams;
  const wecomMessage = wecomOauthStatus ? wecomOauthMessage(m.login.wecomOAuth, wecomOauthStatus, wecomUserId) : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <LoginLocaleSwitcher locale={locale} />
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-slate-900 text-white text-xl font-semibold mb-4">
            F
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{m.login.title}</h1>
          <p className="text-sm text-slate-500 mt-2">
            {firstRun ? m.login.firstRunDesc : m.login.normalDesc}
          </p>
        </div>
        {wecomMessage && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {wecomMessage}
          </div>
        )}
        <LoginForm firstRun={firstRun} messages={m.login} />
      </div>
    </div>
  );
}

function wecomOauthMessage(
  messages: {
    missingConfig: string;
    missingCode: string;
    badState: string;
    notBound: string;
    apiError: string;
    invalidUserId: string;
    generic: string;
  },
  status: string,
  wecomUserId?: string,
) {
  if (status === "missing_config") return messages.missingConfig;
  if (status === "missing_code") return messages.missingCode;
  if (status === "bad_state") return messages.badState;
  if (status === "not_bound") return messages.notBound.replace("{id}", wecomUserId || "unknown");
  if (status === "wecom_api_error") return messages.apiError;
  if (status === "invalid_userid") return messages.invalidUserId;
  return messages.generic;
}
