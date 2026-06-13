import { CONTACT_ROLE_CODES, CONTACT_ROLE_LABELS, ATTITUDE_LABELS, attitudeLabel } from "@/lib/constants";

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

function NodeCard({ c }: { c: PowerMapContact }) {
  return (
    <div className="relative inline-block">
      {/* 角色代码（左上角） */}
      <span
        className="absolute -top-2 -left-2 w-5 h-5 rounded-sm bg-green-600 text-white text-[11px] font-bold flex items-center justify-center z-10"
        title={CONTACT_ROLE_LABELS[c.role] ?? c.role}
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
      <div className="border border-zinc-400 bg-white px-4 py-2 min-w-[110px] text-center shadow-sm">
        <div className="text-sm font-medium text-zinc-900 whitespace-nowrap">{c.name}</div>
        <div className="text-xs text-zinc-500 whitespace-nowrap">
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
      <div className="flex items-center gap-2">
        <span className="w-4 h-4 rounded-sm bg-green-600 text-white text-[10px] font-bold flex items-center justify-center">A</span>
        <span>
          {Object.entries(CONTACT_ROLE_CODES)
            .map(([k, code]) => `${code}=${CONTACT_ROLE_LABELS[k]}`)
            .join("  ")}
        </span>
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
