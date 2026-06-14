"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "工作台", icon: "◧" },
  { href: "/pool", label: "伙伴库", icon: "◬" },
  { href: "/partners", label: "正式伙伴", icon: "◮" },
  { href: "/todos", label: "待办事项", icon: "☑" },
  { href: "/documents", label: "报告中心", icon: "📄" },
  { href: "/materials", label: "物料中心", icon: "📦" },
  { href: "/ai", label: "AI 中心", icon: "✦", aliases: ["/agents", "/tools", "/skills", "/knowledge"] },
  { href: "/inbox", label: "收件箱", icon: "✉" },
  { href: "/dashboard", label: "经营看板", icon: "◫" },
  { href: "/settings", label: "团队设置", icon: "⚙" },
];

function linkAliases(link: (typeof links)[number]) {
  return "aliases" in link && Array.isArray(link.aliases) ? link.aliases : [];
}

export function NavLinks({ unread = 0 }: { unread?: number }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 px-3 py-4 space-y-1">
      {links.map((l) => {
        const active =
          l.href === "/"
            ? pathname === "/"
            : pathname.startsWith(l.href) || linkAliases(l).some((href) => pathname.startsWith(href));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              active
                ? "bg-indigo-600/20 text-indigo-300 font-medium"
                : "hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <span className="text-base w-5 text-center">{l.icon}</span>
            <span className="flex-1">{l.label}</span>
            {l.href === "/inbox" && unread > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
