"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "工作台", icon: "◧" },
  { href: "/pool", label: "候选池", icon: "◬" },
  { href: "/partners", label: "正式伙伴", icon: "◮" },
  { href: "/todos", label: "待办事项", icon: "☑" },
  { href: "/import", label: "AI 信息投喂", icon: "✦" },
  { href: "/dashboard", label: "经营看板", icon: "◫" },
  { href: "/settings", label: "团队设置", icon: "⚙" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 px-3 py-4 space-y-1">
      {links.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
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
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
