"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  ConnectionMode,
  ConnectionLineType,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  CONTACT_ROLE_CODES,
  CONTACT_ROLE_LABELS,
  CONTACT_ROLES_BY_INFLUENCE,
  ATTITUDE_LABELS,
  attitudeLabel,
  roleInfluence,
} from "@/lib/constants";
import { attitudeDotClass, roleInfluenceStyle, PowerMapLegend, type PowerMapContact } from "@/components/power-map";
import {
  moveContactAction,
  setReportsToAction,
  addContactLinkAction,
  removeContactLinkAction,
  removeContactLinkBetweenAction,
  resetPowerMapLayoutAction,
  upsertContactAction,
  deleteContactAction,
} from "@/lib/actions";

export type PowerMapNodeContact = PowerMapContact & {
  x: number | null;
  y: number | null;
  contactInfo?: string | null;
  approach?: string | null;
  notes?: string | null;
};

export type PowerMapLink = {
  id: string;
  subordinateId: string;
  superiorId: string;
  kind: string; // SOLID | DOTTED
};

const NODE_W = 190;
const NODE_H = 120;
const ARROW = { type: MarkerType.ArrowClosed, color: "#a1a1aa" } as const;

type NodeData = { c: PowerMapContact };

// 自定义节点：复用权力地图卡片样式（左上角色代码、右上态度评分）
function ContactNode({ data }: NodeProps<Node<NodeData>>) {
  const c = data.c;
  const s = roleInfluenceStyle(c.role);
  return (
    <div className="relative pm-node">
      {/* 顶部：作为下级的连接点（上级连到这里） */}
      <Handle type="target" position={Position.Top} className="pm-handle" />
      {/* 角色代码：影响力越高颜色越深（D>A>E>I>S） */}
      <span
        className={`absolute -top-2 -left-2 rounded-sm text-white font-bold flex items-center justify-center z-10 ${s.badge}`}
        title={`${CONTACT_ROLE_LABELS[c.role] ?? c.role}（影响力 ${roleInfluence(c.role)}/5）`}
      >
        {CONTACT_ROLE_CODES[c.role] ?? "I"}
      </span>
      <span
        className={`absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center z-10 ${attitudeDotClass(c.attitude)}`}
        title={attitudeLabel(c.attitude)}
      >
        {c.attitude}
      </span>
      {/* 卡片大小随影响力变化 */}
      <div className={`border bg-white text-center shadow-sm rounded ${s.card}`}>
        <div className={`font-medium text-zinc-900 whitespace-nowrap ${s.name}`}>{c.name}</div>
        <div className={`text-zinc-500 whitespace-nowrap ${s.sub}`}>{c.department || c.title || "—"}</div>
      </div>
      {/* 底部：作为上级的连接点（从这里拖到下级） */}
      <Handle type="source" position={Position.Bottom} className="pm-handle" />
    </div>
  );
}

const nodeTypes = { contact: ContactNode };

// 自动布局：按实线（reportsToId）自上而下分层，与静态树形一致
function autoLayout(contacts: PowerMapNodeContact[]): Map<string, { x: number; y: number }> {
  const ids = new Set(contacts.map((c) => c.id));
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const c of contacts) {
    if (c.reportsToId && ids.has(c.reportsToId)) {
      childrenOf.set(c.reportsToId, [...(childrenOf.get(c.reportsToId) ?? []), c.id]);
      hasParent.add(c.id);
    }
  }
  const roots = contacts.filter((c) => !hasParent.has(c.id)).map((c) => c.id);
  const pos = new Map<string, { x: number; y: number }>();
  const placing = new Set<string>();
  let leafX = 0;

  const place = (id: string, depth: number): number => {
    if (placing.has(id)) {
      const x = leafX * NODE_W;
      leafX++;
      pos.set(id, { x, y: depth * NODE_H });
      return x;
    }
    placing.add(id);
    const kids = (childrenOf.get(id) ?? []).filter((k) => !pos.has(k));
    let x: number;
    if (kids.length === 0) {
      x = leafX * NODE_W;
      leafX++;
    } else {
      const xs = kids.map((k) => place(k, depth + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    pos.set(id, { x, y: depth * NODE_H });
    return x;
  };

  for (const r of roots) if (!pos.has(r)) place(r, 0);
  for (const c of contacts) {
    if (!pos.has(c.id)) {
      pos.set(c.id, { x: leafX * NODE_W, y: 0 });
      leafX++;
    }
  }
  return pos;
}

function buildNodes(contacts: PowerMapNodeContact[]): Node<NodeData>[] {
  const auto = autoLayout(contacts);
  return contacts.map((c) => {
    const fallback = auto.get(c.id) ?? { x: 0, y: 0 };
    const position = c.x != null && c.y != null ? { x: c.x, y: c.y } : fallback;
    return { id: c.id, type: "contact", position, data: { c } };
  });
}

function buildEdges(contacts: PowerMapNodeContact[], links: PowerMapLink[]): Edge[] {
  const ids = new Set(contacts.map((c) => c.id));
  const edges: Edge[] = [];
  for (const c of contacts) {
    if (c.reportsToId && ids.has(c.reportsToId)) {
      edges.push({
        id: `r-${c.id}`,
        source: c.reportsToId,
        target: c.id,
        markerEnd: ARROW,
        style: { stroke: "#a1a1aa", strokeWidth: 1.5 },
        data: { origin: "reportsTo", childId: c.id, superiorId: c.reportsToId },
      });
    }
  }
  for (const l of links) {
    if (!ids.has(l.subordinateId) || !ids.has(l.superiorId)) continue;
    const dotted = l.kind !== "SOLID";
    edges.push({
      id: `l-${l.id}`,
      source: l.superiorId,
      target: l.subordinateId,
      markerEnd: ARROW,
      style: dotted
        ? { stroke: "#a1a1aa", strokeWidth: 1.5, strokeDasharray: "5 5" }
        : { stroke: "#a1a1aa", strokeWidth: 1.5 },
      data: { origin: "link", linkId: l.id, kind: l.kind, subId: l.subordinateId, supId: l.superiorId },
    });
  }
  return edges;
}

function signature(contacts: PowerMapNodeContact[], links: PowerMapLink[]) {
  return JSON.stringify([
    contacts.map((c) => [c.id, c.reportsToId, c.x, c.y, c.attitude, c.role, c.name, c.department, c.title]),
    links.map((l) => [l.id, l.subordinateId, l.superiorId, l.kind]),
  ]);
}

// 画布样式：连接点放大+悬停脉冲、连线动画、选中连线高亮蚂蚁线
const FLOW_CSS = `
.pm-handle {
  width: 11px !important;
  height: 11px !important;
  background: #fff !important;
  border: 2px solid #6366f1 !important;
  opacity: 0.55;
  transition: transform 0.12s ease, opacity 0.12s ease, box-shadow 0.12s ease;
}
.pm-node:hover .pm-handle { opacity: 1; transform: scale(1.25); }
.pm-handle:hover {
  opacity: 1 !important;
  transform: scale(1.6) !important;
  box-shadow: 0 0 0 4px rgba(99,102,241,0.25) !important;
  animation: pm-pulse 1s ease-in-out infinite;
}
.react-flow__handle-connecting { background: #6366f1 !important; }
.react-flow__handle-valid {
  background: #22c55e !important;
  border-color: #22c55e !important;
  box-shadow: 0 0 0 6px rgba(34,197,94,0.25) !important;
}
@keyframes pm-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(99,102,241,0.2); }
  50% { box-shadow: 0 0 0 7px rgba(99,102,241,0.35); }
}
.react-flow__edge.selected .react-flow__edge-path {
  stroke: #6366f1 !important;
  stroke-width: 2.5 !important;
  stroke-dasharray: 6 !important;
  animation: pm-dash 0.55s linear infinite;
}
@keyframes pm-dash { to { stroke-dashoffset: -12; } }
.react-flow__edge:hover .react-flow__edge-path { stroke: #818cf8 !important; }
`;

type UndoEntry = { label: string; run: () => void };

function FlowInner({
  partnerId,
  contacts,
  links,
  onSelectContact,
}: {
  partnerId: string;
  contacts: PowerMapNodeContact[];
  links: PowerMapLink[];
  onSelectContact?: (id: string) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>(buildNodes(contacts));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(buildEdges(contacts, links));
  const [lineMode, setLineMode] = useState<"SOLID" | "DOTTED">("SOLID");
  const [selectedEdges, setSelectedEdges] = useState<Edge[]>([]);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [, startTransition] = useTransition();
  const { deleteElements, fitView } = useReactFlow();

  // 拖动起点位置（用于撤销摆放）
  const dragStart = useRef<Map<string, { x: number; y: number }>>(new Map());
  // 已知节点 id（用于检测新增人物后自动适配视图）
  const knownIds = useRef<Set<string>>(new Set(contacts.map((c) => c.id)));
  // 当前 reportsTo 映射（用于撤销改主汇报）
  const reportsToMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const c of contacts) m.set(c.id, c.reportsToId ?? null);
    return m;
  }, [contacts]);

  const sig = useMemo(() => signature(contacts, links), [contacts, links]);

  useEffect(() => {
    setNodes(buildNodes(contacts));
    setEdges(buildEdges(contacts, links));
    // 有新人物加入时，自动把视图缩放到能看到所有人（含新加的）
    const added = contacts.some((c) => !knownIds.current.has(c.id));
    knownIds.current = new Set(contacts.map((c) => c.id));
    if (added) {
      const t = setTimeout(() => fitView({ duration: 400, padding: 0.2 }), 80);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const pushUndo = useCallback((entry: UndoEntry) => {
    setUndoStack((s) => [...s, entry].slice(-50));
  }, []);

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<NodeData>>[]) => {
      onNodesChange(changes);
      for (const ch of changes) {
        if (ch.type === "position" && ch.dragging === false && ch.position) {
          const { x, y } = ch.position;
          const prev = dragStart.current.get(ch.id);
          const id = ch.id;
          if (prev && (prev.x !== x || prev.y !== y)) {
            const px = prev.x;
            const py = prev.y;
            pushUndo({
              label: "移动",
              run: () => startTransition(() => void moveContactAction(partnerId, id, px, py)),
            });
          }
          dragStart.current.delete(id);
          startTransition(() => void moveContactAction(partnerId, id, x, y));
        }
      }
    },
    [onNodesChange, partnerId, pushUndo],
  );

  const onNodeDragStart = useCallback((_: unknown, node: Node) => {
    dragStart.current.set(node.id, { x: node.position.x, y: node.position.y });
  }, []);

  const onConnect = useCallback(
    (conn: Connection) => {
      const superiorId = conn.source;
      const subId = conn.target;
      if (!superiorId || !subId || superiorId === subId) return;

      if (lineMode === "SOLID") {
        const oldSup = reportsToMap.get(subId) ?? null;
        // 乐观反馈
        setEdges((es) =>
          addEdge(
            {
              id: `r-${subId}`,
              source: superiorId,
              target: subId,
              markerEnd: ARROW,
              style: { stroke: "#a1a1aa", strokeWidth: 1.5 },
              data: { origin: "reportsTo", childId: subId, superiorId },
            },
            es.filter((e) => e.id !== `r-${subId}`),
          ),
        );
        pushUndo({
          label: "改主汇报",
          run: () => startTransition(() => void setReportsToAction(partnerId, subId, oldSup)),
        });
        startTransition(() => void setReportsToAction(partnerId, subId, superiorId));
      } else {
        const tmpId = `tmp-${superiorId}-${subId}`;
        setEdges((es) =>
          addEdge(
            {
              id: tmpId,
              source: superiorId,
              target: subId,
              markerEnd: ARROW,
              style: { stroke: "#a1a1aa", strokeWidth: 1.5, strokeDasharray: "5 5" },
              data: { origin: "link", kind: "DOTTED", subId, supId: superiorId },
            },
            es,
          ),
        );
        pushUndo({
          label: "附加虚线",
          run: () =>
            startTransition(() => void removeContactLinkBetweenAction(partnerId, subId, superiorId)),
        });
        startTransition(() => void addContactLinkAction(partnerId, subId, superiorId, "DOTTED"));
      }
    },
    [partnerId, lineMode, reportsToMap, setEdges, pushUndo],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const e of deleted) {
        const d = (e.data ?? {}) as {
          origin?: string;
          childId?: string;
          superiorId?: string;
          linkId?: string;
          kind?: string;
          subId?: string;
          supId?: string;
        };
        if (d.origin === "reportsTo" && d.childId) {
          const childId = d.childId;
          const oldSup = d.superiorId ?? null;
          pushUndo({
            label: "删除主汇报",
            run: () => startTransition(() => void setReportsToAction(partnerId, childId, oldSup)),
          });
          startTransition(() => void setReportsToAction(partnerId, childId, null));
        } else if (d.origin === "link" && d.subId && d.supId) {
          const sub = d.subId;
          const sup = d.supId;
          const kind = d.kind ?? "DOTTED";
          pushUndo({
            label: "删除附加线",
            run: () => startTransition(() => void addContactLinkAction(partnerId, sub, sup, kind)),
          });
          if (d.linkId) startTransition(() => void removeContactLinkAction(partnerId, d.linkId!));
          else startTransition(() => void removeContactLinkBetweenAction(partnerId, sub, sup));
        }
      }
    },
    [partnerId, pushUndo],
  );

  const onSelectionChange = useCallback(
    ({ edges: sel }: { edges: Edge[] }) => setSelectedEdges(sel),
    [],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedEdges.length) return;
    void deleteElements({ edges: selectedEdges.map((e) => ({ id: e.id })) });
  }, [selectedEdges, deleteElements]);

  const undo = useCallback(() => {
    setUndoStack((s) => {
      if (!s.length) return s;
      const last = s[s.length - 1];
      last.run();
      return s.slice(0, -1);
    });
  }, []);

  const onResetLayout = useCallback(() => {
    startTransition(() => void resetPowerMapLayoutAction(partnerId));
    setUndoStack([]);
  }, [partnerId]);

  // 键盘：Cmd/Ctrl+Z 撤销
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  const btn = "rounded-md px-2.5 py-1 border transition-colors";
  const btnIdle = "border-zinc-200 text-zinc-600 hover:border-zinc-300";

  return (
    <div>
      <style>{FLOW_CSS}</style>
      <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
        <span className="text-zinc-400">连线类型：</span>
        <button
          type="button"
          onClick={() => setLineMode("SOLID")}
          className={`${btn} ${lineMode === "SOLID" ? "bg-zinc-900 text-white border-zinc-900" : btnIdle}`}
        >
          实线 · 改主汇报
        </button>
        <button
          type="button"
          onClick={() => setLineMode("DOTTED")}
          className={`${btn} ${lineMode === "DOTTED" ? "bg-zinc-900 text-white border-zinc-900" : btnIdle}`}
        >
          虚线 · 附加汇报
        </button>
        <span className="text-zinc-300">|</span>
        <button
          type="button"
          onClick={undo}
          disabled={!undoStack.length}
          className={`${btn} ${btnIdle} disabled:opacity-40 disabled:cursor-not-allowed`}
          title="撤销 (Cmd/Ctrl+Z)"
        >
          ↩ 撤销{undoStack.length ? `（${undoStack.length}）` : ""}
        </button>
        <button
          type="button"
          onClick={deleteSelected}
          disabled={!selectedEdges.length}
          className={`${btn} border-red-200 text-red-600 hover:border-red-300 disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          删除选中连线
        </button>
        <button type="button" onClick={onResetLayout} className={`${btn} ${btnIdle}`}>
          重新自动排版
        </button>
      </div>
      <p className="text-[11px] text-zinc-400 mb-2">
        提示：单击人物卡可编辑其信息；把鼠标移到卡片小圆点上，从一个人拖到另一个人即可连线（绿色高亮表示可连接）；点中连线后按 Delete/Backspace 或上方按钮删除。
      </p>
      <div className="h-[460px] rounded-lg border border-zinc-100 bg-zinc-50/40">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={onNodeDragStart}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onSelectionChange={onSelectionChange}
          onNodeClick={(_, node) => onSelectContact?.(node.id)}
          connectionMode={ConnectionMode.Loose}
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionLineStyle={{ stroke: "#6366f1", strokeWidth: 2.5, strokeDasharray: "6 4" }}
          connectionRadius={40}
          deleteKeyCode={["Backspace", "Delete"]}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} color="#e4e4e7" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

// ============ 编辑抽屉：点节点 / 点列表行 → 就地编辑该人 ============

const DRAWER_INPUT =
  "w-full rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none";

function EditDrawer({
  partnerId,
  contact,
  allContacts,
  onClose,
}: {
  partnerId: string;
  contact: PowerMapNodeContact | null; // null = 新增模式
  allContacts: PowerMapNodeContact[];
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const isNew = !contact;

  const save = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    if (!String(fd.get("name") ?? "").trim()) return;
    start(async () => {
      await upsertContactAction(partnerId, fd);
      onClose();
    });
  }, [partnerId, onClose]);

  const remove = useCallback(() => {
    if (!contact) return;
    start(async () => {
      await deleteContactAction(partnerId, contact.id);
      onClose();
    });
  }, [partnerId, contact, onClose]);

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[340px] max-w-[88vw] bg-white shadow-xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
          <span className="font-medium text-zinc-900">{isNew ? "添加人物" : `编辑：${contact?.name}`}</span>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">
            ×
          </button>
        </div>
        <form ref={formRef} className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          {!isNew && <input type="hidden" name="id" value={contact!.id} />}
          <label className="block">
            <span className="text-xs text-zinc-500">姓名</span>
            <input name="name" defaultValue={contact?.name ?? ""} placeholder="姓名" className={DRAWER_INPUT} />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-500">角色（影响力 D&gt;A&gt;E&gt;I&gt;S）</span>
            <select name="role" defaultValue={contact?.role ?? "INFLUENCER"} className={DRAWER_INPUT}>
              {CONTACT_ROLES_BY_INFLUENCE.map((k) => (
                <option key={k} value={k}>
                  {CONTACT_ROLE_CODES[k]} · {CONTACT_ROLE_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-zinc-500">态度</span>
            <select name="attitude" defaultValue={String(contact?.attitude ?? 0)} className={DRAWER_INPUT}>
              {Object.entries(ATTITUDE_LABELS)
                .sort((a, b) => Number(b[0]) - Number(a[0]))
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {k} · {v}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-zinc-500">职位</span>
            <input name="title" defaultValue={contact?.title ?? ""} placeholder="职位" className={DRAWER_INPUT} />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-500">部门</span>
            <input name="department" defaultValue={contact?.department ?? ""} placeholder="部门" className={DRAWER_INPUT} />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-500">汇报上级</span>
            <select name="reportsToId" defaultValue={contact?.reportsToId ?? ""} className={DRAWER_INPUT}>
              <option value="">（无 = 顶层）</option>
              {allContacts
                .filter((x) => x.id !== contact?.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    汇报给 {x.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-zinc-500">联系方式</span>
            <input name="contactInfo" defaultValue={contact?.contactInfo ?? ""} placeholder="联系方式" className={DRAWER_INPUT} />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-500">最佳接触方式</span>
            <input name="approach" defaultValue={contact?.approach ?? ""} placeholder="最佳接触方式" className={DRAWER_INPUT} />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-500">备注</span>
            <textarea name="notes" defaultValue={contact?.notes ?? ""} placeholder="备注" rows={3} className={DRAWER_INPUT} />
          </label>
        </form>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-zinc-100">
          {!isNew ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-40"
            >
              删除
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:border-zinc-300"
            >
              取消
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-md bg-zinc-900 text-white px-3 py-1.5 text-xs hover:bg-zinc-700 disabled:opacity-50"
            >
              {pending ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============ 人员列表：搜索 + 可折叠 + 点行编辑 ============

function ContactList({
  contacts,
  selectedId,
  onSelect,
  onAdd,
}: {
  contacts: PowerMapNodeContact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(contacts.length <= 8);
  const [q, setQ] = useState("");

  const sorted = useMemo(
    () =>
      [...contacts].sort(
        (a, b) => roleInfluence(b.role) - roleInfluence(a.role) || b.attitude - a.attitude,
      ),
    [contacts],
  );
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return sorted;
    return sorted.filter((c) =>
      [
        c.name,
        c.title ?? "",
        c.department ?? "",
        CONTACT_ROLE_LABELS[c.role] ?? "",
        attitudeLabel(c.attitude),
      ]
        .join(" ")
        .toLowerCase()
        .includes(kw),
    );
  }, [sorted, q]);

  return (
    <div className="mt-4 rounded-lg border border-zinc-100">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-100">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-sm font-medium text-zinc-700"
        >
          <span className={`text-zinc-300 transition-transform ${open ? "rotate-90" : ""}`}>›</span>
          关键人物（{contacts.length}）
        </button>
        <div className="flex-1" />
        {open && (
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索 姓名/职位/部门/角色/态度"
            className="w-44 rounded-md border border-zinc-200 px-2.5 py-1 text-xs focus:border-indigo-400 focus:outline-none"
          />
        )}
        <button
          type="button"
          onClick={onAdd}
          className="rounded-md bg-indigo-600 text-white px-2.5 py-1 text-xs hover:bg-indigo-700"
        >
          + 加人
        </button>
      </div>
      {open && (
        <div className="divide-y divide-zinc-50 max-h-[360px] overflow-y-auto">
          {filtered.map((c) => {
            const s = roleInfluenceStyle(c.role);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-zinc-50 ${
                  selectedId === c.id ? "bg-indigo-50" : ""
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-8 h-8 rounded-full bg-zinc-100 text-zinc-600 flex items-center justify-center text-sm font-semibold">
                    {c.name.slice(0, 1)}
                  </div>
                  <span
                    className={`absolute -top-1 -right-1.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${attitudeDotClass(c.attitude)}`}
                  >
                    {c.attitude}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900 truncate">{c.name}</span>
                    <span
                      className={`shrink-0 rounded-sm text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center ${s.badge}`}
                      title={`${CONTACT_ROLE_LABELS[c.role] ?? c.role}（影响力 ${roleInfluence(c.role)}/5）`}
                    >
                      {CONTACT_ROLE_CODES[c.role] ?? "I"}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 truncate">
                    {[c.title, c.department].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <span className="text-zinc-300 text-xs shrink-0">编辑 ›</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-zinc-400">
              {q ? "没有匹配的人物" : "还没有关键人物，点「+ 加人」添加。"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PowerMapSection({
  partnerId,
  contacts,
  links,
}: {
  partnerId: string;
  contacts: PowerMapNodeContact[];
  links: PowerMapLink[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const selected = adding ? null : contacts.find((c) => c.id === selectedId) ?? null;
  const drawerOpen = adding || !!selected;

  const closeDrawer = useCallback(() => {
    setAdding(false);
    setSelectedId(null);
  }, []);
  const selectContact = useCallback((id: string) => {
    setAdding(false);
    setSelectedId(id);
  }, []);
  const startAdd = useCallback(() => {
    setSelectedId(null);
    setAdding(true);
  }, []);

  return (
    <div>
      <div className="mb-3 rounded-lg bg-zinc-50/80 border border-zinc-100 px-4 py-3">
        <PowerMapLegend />
      </div>
      {contacts.length > 0 ? (
        <ReactFlowProvider>
          <FlowInner partnerId={partnerId} contacts={contacts} links={links} onSelectContact={selectContact} />
        </ReactFlowProvider>
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-400">
          还没有关键人物。点下方「+ 加人」手动添加，或用上方「✦ AI 加人」从文字/图片提取。
        </div>
      )}
      <ContactList contacts={contacts} selectedId={selectedId} onSelect={selectContact} onAdd={startAdd} />
      {drawerOpen && (
        <EditDrawer partnerId={partnerId} contact={selected} allContacts={contacts} onClose={closeDrawer} />
      )}
    </div>
  );
}
