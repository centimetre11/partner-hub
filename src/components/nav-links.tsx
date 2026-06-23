"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-medium flex items-center justify-center">
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
    { href: "/mobile", label: m.nav.mobileDesk, icon: "▣" },
    { href: "/leads", label: m.nav.leads, icon: "◔" },
    { href: "/partners", label: m.nav.activePartners, icon: "◮" },
    { href: "/customers", label: m.nav.customers, icon: "◍" },
    {
      id: "resources",
      label: m.nav.resources,
      icon: "▦",
      children: [
        { href: "/framework", label: m.nav.framework, icon: "◎" },
        { href: "/pool", label: m.nav.partnerPool, icon: "◬" },
        { href: "/materials", label: m.nav.materials, icon: "📦" },
        { href: "/knowhow", label: m.nav.knowhow, icon: "🔍" },
        { href: "/faq", label: m.nav.faq, icon: "?" },
        { href: "/taxonomy", label: m.nav.taxonomy, icon: "◇" },
        { href: "/playbook-library", label: m.nav.playbookLibrary, icon: "◈" },
      ],
    },
    ...(INBOX_NAV_ENABLED
      ? [{ href: "/inbox" as const, label: m.nav.inbox, icon: "✉", badge: "unread" as const }]
      : []),
    { href: "/ai", label: m.nav.aiHub, icon: "✦", aliases: ["/agents", "/tools", "/skills", "/knowledge", "/automations"] },
    { href: "/settings", label: m.nav.teamSettings, icon: "⚙" },
  ];

  const leafActive = (l: Leaf) =>
    l.href === "/"
      ? pathname === "/"
      : pathname.startsWith(l.href) || (l.aliases ?? []).some((href) => pathname.startsWith(href));

  return (
    <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
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
      className={`flex items-center gap-3 ${nested ? "pl-9 pr-3" : "px-3"} py-2 rounded-md text-sm ${
        active ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      <span className="text-sm w-5 text-center opacity-70">{leaf.icon}</span>
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
  const prevActive = useRef(hasActiveChild);
  // 当从外部导航进入某个子项时自动展开；但允许用户在子项页面手动折叠父级。
  useEffect(() => {
    if (hasActiveChild && !prevActive.current) setOpen(true);
    prevActive.current = hasActiveChild;
  }, [hasActiveChild]);
  const expanded = open;
  const groupUnread = group.children.some((c) => c.badge === "unread") ? unread : 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm ${
          hasActiveChild ? "text-slate-900 font-medium" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        }`}
      >
        <span className="text-sm w-5 text-center opacity-70">{group.icon}</span>
        <span className="flex-1 text-left">{group.label}</span>
        {!expanded && groupUnread > 0 && <Badge count={groupUnread} />}
        <span className={`text-[10px] text-slate-400 ${expanded ? "rotate-90" : ""}`}>▶</span>
      </button>
      {expanded && (
        <div className="mt-0.5 space-y-0.5">
          {group.children.map((c) => (
            <NavLeaf key={c.href} leaf={c} active={leafActive(c)} unread={unread} nested onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}
