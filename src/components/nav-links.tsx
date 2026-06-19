"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useMessages } from "@/lib/i18n/context";
import { INBOX_NAV_ENABLED } from "@/lib/feature-flags";

type Leaf = { href: string; label: string; icon: string; aliases?: string[]; badge?: "unread" };
type Group = { id: string; label: string; icon: string; children: Leaf[] };
type Entry = Leaf | Group;

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

export function NavLinks({
  unread = 0,
  onNavigate,
  showTeamSettings = false,
}: {
  unread?: number;
  onNavigate?: () => void;
  showTeamSettings?: boolean;
}) {
  const m = useMessages();
  const pathname = usePathname();

  const nav: Entry[] = [
    { href: "/", label: m.nav.dashboard, icon: "◧" },
    { href: "/partners", label: m.nav.activePartners, icon: "◮" },
    { href: "/todos", label: m.nav.todos, icon: "☑" },
    {
      id: "resources",
      label: m.nav.resources,
      icon: "▦",
      children: [
        { href: "/framework", label: m.nav.framework, icon: "◎" },
        { href: "/taxonomy", label: m.nav.taxonomy, icon: "◇" },
        { href: "/playbook-library", label: m.nav.playbookLibrary, icon: "◈" },
        { href: "/pool", label: m.nav.partnerPool, icon: "◬" },
        { href: "/materials", label: m.nav.materials, icon: "📦" },
      ],
    },
    ...(INBOX_NAV_ENABLED
      ? [{ href: "/inbox" as const, label: m.nav.inbox, icon: "✉", badge: "unread" as const }]
      : []),
    { href: "/ai", label: m.nav.aiHub, icon: "✦", aliases: ["/agents", "/tools", "/skills", "/knowledge", "/knowhow"] },
    { href: "/settings", label: m.nav.teamSettings, icon: "⚙" },
  ];

  const leafActive = (l: Leaf) =>
    l.href === "/"
      ? pathname === "/"
      : pathname.startsWith(l.href) || (l.aliases ?? []).some((href) => pathname.startsWith(href));

  return (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      {nav
        .filter((entry) => !isGroup(entry) && entry.href === "/settings" ? showTeamSettings : true)
        .map((entry) =>
        isGroup(entry) ? (
          <NavGroup key={entry.id} group={entry} leafActive={leafActive} unread={unread} onNavigate={onNavigate} />
        ) : (
          <NavLeaf key={entry.href} leaf={entry} active={leafActive(entry)} unread={unread} onNavigate={onNavigate} />
        ),
      )}
    </nav>
  );
}

function NavLeaf({
  leaf,
  active,
  unread,
  nested = false,
  onNavigate,
}: {
  leaf: Leaf;
  active: boolean;
  unread: number;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={leaf.href}
      onClick={onNavigate}
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

function NavGroup({
  group,
  leafActive,
  unread,
  onNavigate,
}: {
  group: Group;
  leafActive: (l: Leaf) => boolean;
  unread: number;
  onNavigate?: () => void;
}) {
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
            <NavLeaf key={c.href} leaf={c} active={leafActive(c)} unread={unread} nested onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}
