"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Leaf = { href: string; label: string; icon: string; aliases?: string[]; badge?: "unread" };
type Group = { id: string; label: string; icon: string; children: Leaf[] };
type Entry = Leaf | Group;

const nav: Entry[] = [
  { href: "/", label: "工作台", icon: "◧" },
  {
    id: "resources",
    label: "资源中心",
    icon: "▦",
    children: [
      { href: "/pool", label: "伙伴库", icon: "◬" },
      { href: "/documents", label: "报告中心", icon: "📄" },
      { href: "/materials", label: "物料中心", icon: "📦" },
    ],
  },
  { href: "/partners", label: "正式伙伴", icon: "◮" },
  { href: "/framework", label: "经营框架", icon: "◎" },
  {
    id: "work",
    label: "工作中心",
    icon: "◳",
    children: [
      { href: "/todos", label: "待办事项", icon: "☑" },
      { href: "/inbox", label: "收件箱", icon: "✉", badge: "unread" },
    ],
  },
  { href: "/ai", label: "AI 中心", icon: "✦", aliases: ["/agents", "/tools", "/skills", "/knowledge"] },
  { href: "/settings", label: "团队设置", icon: "⚙" },
];

function isGroup(e: Entry): e is Group {
  return "children" in e;
}

function Badge({ count }: { count: number }) {
  return (
    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function NavLinks({ unread = 0 }: { unread?: number }) {
  const pathname = usePathname();

  const leafActive = (l: Leaf) =>
    l.href === "/"
      ? pathname === "/"
      : pathname.startsWith(l.href) || (l.aliases ?? []).some((href) => pathname.startsWith(href));

  return (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      {nav.map((entry) =>
        isGroup(entry) ? (
          <NavGroup key={entry.id} group={entry} leafActive={leafActive} unread={unread} />
        ) : (
          <NavLeaf key={entry.href} leaf={entry} active={leafActive(entry)} unread={unread} />
        ),
      )}
    </nav>
  );
}

function NavLeaf({ leaf, active, unread, nested = false }: { leaf: Leaf; active: boolean; unread: number; nested?: boolean }) {
  return (
    <Link
      href={leaf.href}
      className={`flex items-center gap-3 ${nested ? "pl-9 pr-3" : "px-3"} py-2 rounded-lg text-sm transition-colors ${
        active ? "bg-indigo-600/20 text-indigo-300 font-medium" : "hover:bg-zinc-800 hover:text-white"
      }`}
    >
      <span className="text-base w-5 text-center">{leaf.icon}</span>
      <span className="flex-1">{leaf.label}</span>
      {leaf.badge === "unread" && unread > 0 && <Badge count={unread} />}
    </Link>
  );
}

function NavGroup({ group, leafActive, unread }: { group: Group; leafActive: (l: Leaf) => boolean; unread: number }) {
  const hasActiveChild = group.children.some(leafActive);
  const [open, setOpen] = useState(true);
  const expanded = open || hasActiveChild;
  const groupUnread = group.children.some((c) => c.badge === "unread") ? unread : 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
          hasActiveChild ? "text-zinc-100" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
        }`}
      >
        <span className="text-base w-5 text-center">{group.icon}</span>
        <span className="flex-1 text-left">{group.label}</span>
        {!expanded && groupUnread > 0 && <Badge count={groupUnread} />}
        <span className={`text-[10px] text-zinc-500 transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
      </button>
      {expanded && (
        <div className="mt-1 space-y-1">
          {group.children.map((c) => (
            <NavLeaf key={c.href} leaf={c} active={leafActive(c)} unread={unread} nested />
          ))}
        </div>
      )}
    </div>
  );
}
