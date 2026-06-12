import { requireUser } from "@/lib/session";
import { logoutAction } from "@/lib/actions";
import { NavLinks } from "@/components/nav-links";
import { AssistantDock } from "@/components/assistant-dock";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 bg-zinc-900 text-zinc-300 flex flex-col fixed inset-y-0 z-30">
        <div className="px-5 py-5 flex items-center gap-2.5 border-b border-zinc-800">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 text-white flex items-center justify-center font-bold">
            帆
          </div>
          <div>
            <div className="text-sm font-semibold text-white leading-tight">中东伙伴管理</div>
            <div className="text-[10px] text-zinc-500">Fanruan MEA Partner Hub</div>
          </div>
        </div>
        <NavLinks />
        <div className="mt-auto border-t border-zinc-800 px-5 py-4">
          <div className="text-xs text-zinc-400 mb-2">
            {user.name} · {user.email}
          </div>
          <form action={logoutAction}>
            <button className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              退出登录
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 ml-56 min-w-0">{children}</main>
      <AssistantDock />
    </div>
  );
}
