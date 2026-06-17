import {
  CONTACT_ROLE_CODES,
  CONTACT_ROLE_LABELS,
  ATTITUDE_LABELS,
  attitudeLabel,
  roleInfluence,
  CONTACT_ROLES_BY_INFLUENCE,
} from "@/lib/constants";

export type PowerMapContact = {
  id: string;
  name: string;
  role: string;
  title: string | null;
  department: string | null;
  attitude: number;
  reportsToId: string | null;
};

// 态度评分圆点配色（参考标准权力地图图例）
export function attitudeDotClass(a: number | null | undefined) {
  const v = a ?? 0;
  if (v >= 2) return "bg-purple-600 text-white"; // 3教练 / 2支持并排他
  if (v === 1) return "bg-amber-400 text-white"; // 支持不排他
  if (v < 0) return "bg-red-600 text-white"; // 反对
  return "bg-zinc-400 text-white"; // 未接触或中立
}

// 角色影响力 → 节点视觉：影响力越高，卡片越大、角色徽标越深
// D(决策者) > A(审批者) > E(评估者) > I(影响者) > S(支持者)
export type RoleInfluenceStyle = { card: string; name: string; sub: string; badge: string };

export function roleInfluenceStyle(role: string): RoleInfluenceStyle {
  switch (roleInfluence(role)) {
    case 5: // D 决策者
      return {
        card: "min-w-[160px] px-5 py-3 border-indigo-500 ring-2 ring-indigo-200",
        name: "text-base",
        sub: "text-xs",
        badge: "w-7 h-7 text-sm bg-indigo-700",
      };
    case 4: // A 审批者
      return {
        card: "min-w-[144px] px-4 py-2.5 border-indigo-400",
        name: "text-sm",
        sub: "text-xs",
        badge: "w-6 h-6 text-xs bg-indigo-600",
      };
    case 3: // E 评估者
      return {
        card: "min-w-[128px] px-4 py-2 border-zinc-400",
        name: "text-sm",
        sub: "text-xs",
        badge: "w-5 h-5 text-[11px] bg-indigo-500",
      };
    case 2: // I 影响者
      return {
        card: "min-w-[116px] px-3.5 py-1.5 border-zinc-300",
        name: "text-[13px]",
        sub: "text-[11px]",
        badge: "w-5 h-5 text-[10px] bg-indigo-400",
      };
    default: // S 支持者(1) / 未知(0)
      return {
        card: "min-w-[106px] px-3 py-1.5 border-zinc-300",
        name: "text-xs",
        sub: "text-[11px]",
        badge: "w-4.5 h-4.5 text-[10px] bg-indigo-300",
      };
  }
}

function NodeCard({ c }: { c: PowerMapContact }) {
  const s = roleInfluenceStyle(c.role);
  return (
    <div className="relative inline-block">
      {/* 角色代码（左上角）：影响力越高颜色越深 */}
      <span
        className={`absolute -top-2 -left-2 rounded-sm text-white font-bold flex items-center justify-center z-10 ${s.badge}`}
        title={`${CONTACT_ROLE_LABELS[c.role] ?? c.role} (influence ${roleInfluence(c.role)}/5)`}
      >
        {CONTACT_ROLE_CODES[c.role] ?? "I"}
      </span>
      {/* 态度评分（右上角） */}
      <span
        className={`absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center z-10 ${attitudeDotClass(c.attitude)}`}
        title={attitudeLabel(c.attitude)}
      >
        {c.attitude}
      </span>
      <div className={`border bg-white text-center shadow-sm ${s.card}`}>
        <div className={`font-medium text-zinc-900 whitespace-nowrap ${s.name}`}>{c.name}</div>
        <div className={`text-zinc-500 whitespace-nowrap ${s.sub}`}>
          {c.department || c.title || "—"}
        </div>
      </div>
    </div>
  );
}

function TreeNode({
  contact,
  childrenMap,
  visited,
}: {
  contact: PowerMapContact;
  childrenMap: Map<string | null, PowerMapContact[]>;
  visited: Set<string>;
}) {
  if (visited.has(contact.id)) return null;
  visited.add(contact.id);
  const children = (childrenMap.get(contact.id) ?? []).filter((c) => !visited.has(c.id));

  return (
    <div className="flex flex-col items-center">
      <NodeCard c={contact} />
      {children.length > 0 && (
        <>
          {/* 向下的连接线 */}
          <div className="w-px h-5 bg-zinc-400" />
          <div className="flex items-start">
            {children.map((child, i) => (
              <div key={child.id} className="relative flex flex-col items-center px-2.5 pt-5">
                {/* 横向连接线：首尾子节点只画半边 */}
                {children.length > 1 && i > 0 && (
                  <span className="absolute top-0 left-0 w-1/2 h-px bg-zinc-400" />
                )}
                {children.length > 1 && i < children.length - 1 && (
                  <span className="absolute top-0 right-0 w-1/2 h-px bg-zinc-400" />
                )}
                {/* 垂直短线接到子节点 */}
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-5 bg-zinc-400" />
                <TreeNode contact={child} childrenMap={childrenMap} visited={visited} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function PowerMapLegend() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-600">
      {/* 角色影响力：按 D>A>E>I>S 从高到低，徽标越深、节点越大代表影响力越强 */}
      <div className="flex items-center gap-1.5">
        <span className="text-zinc-400 mr-0.5">Influence</span>
        {CONTACT_ROLES_BY_INFLUENCE.map((k, i) => (
          <span key={k} className="flex items-center gap-1">
            {i > 0 && <span className="text-zinc-300">›</span>}
            <span
              className={`rounded-sm text-white font-bold flex items-center justify-center ${roleInfluenceStyle(k).badge}`}
              title={`Influence ${roleInfluence(k)}/5`}
            >
              {CONTACT_ROLE_CODES[k]}
            </span>
            <span>{CONTACT_ROLE_LABELS[k]}</span>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2.5">
        {([3, 2, 1, 0, -1] as const).map((v) => (
          <span key={v} className="flex items-center gap-1">
            <span className={`w-4.5 h-4.5 rounded-full text-[10px] font-bold flex items-center justify-center ${attitudeDotClass(v)}`}>
              {v}
            </span>
            {ATTITUDE_LABELS[v]}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PowerMapChart({ contacts }: { contacts: PowerMapContact[] }) {
  if (!contacts.length) return null;

  const ids = new Set(contacts.map((c) => c.id));
  const childrenMap = new Map<string | null, PowerMapContact[]>();
  for (const c of contacts) {
    // 上级不在本伙伴联系人里时按根节点处理
    const key = c.reportsToId && ids.has(c.reportsToId) ? c.reportsToId : null;
    childrenMap.set(key, [...(childrenMap.get(key) ?? []), c]);
  }
  const roots = childrenMap.get(null) ?? [];
  const visited = new Set<string>();

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex items-start gap-8 min-w-max px-2 pt-3">
        {roots.map((r) => (
          <TreeNode key={r.id} contact={r} childrenMap={childrenMap} visited={visited} />
        ))}
      </div>
    </div>
  );
}
