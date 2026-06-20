import Link from "next/link";
import { getServerI18n } from "@/lib/server-i18n";

export async function BuilderModeToggle({
  active,
  autoHref,
  manualHref,
}: {
  active: "auto" | "manual";
  autoHref: string;
  manualHref: string;
}) {
  const { messages: m } = await getServerI18n();
  const b = m.builderCommon;

  const base = "rounded-lg px-4 py-2 text-sm font-medium transition-colors";
  const activeCls = "bg-slate-900 text-white";
  const idleCls = "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <div className="flex items-center gap-2">
      <Link href={autoHref} className={`${base} ${active === "auto" ? activeCls : idleCls}`}>
        {b.modeAuto}
      </Link>
      <Link href={manualHref} className={`${base} ${active === "manual" ? activeCls : idleCls}`}>
        {b.modeManual}
      </Link>
    </div>
  );
}
