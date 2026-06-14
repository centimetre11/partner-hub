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
import { CONTACT_ROLE_CODES, CONTACT_ROLE_LABELS, attitudeLabel, roleInfluence } from "@/lib/constants";
import { attitudeDotClass, roleInfluenceStyle, PowerMapLegend, type PowerMapContact } from "@/components/power-map";
import {
  moveContactAction,
  setReportsToAction,
  addContactLinkAction,
  removeContactLinkAction,
  removeContactLinkBetweenAction,
  resetPowerMapLayoutAction,
} from "@/lib/actions";

export type PowerMapNodeContact = PowerMapContact & {
  x: number | null;
  y: number | null;
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
}: {
  partnerId: string;
  contacts: PowerMapNodeContact[];
  links: PowerMapLink[];
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>(buildNodes(contacts));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(buildEdges(contacts, links));
  const [lineMode, setLineMode] = useState<"SOLID" | "DOTTED">("SOLID");
  const [selectedEdges, setSelectedEdges] = useState<Edge[]>([]);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [, startTransition] = useTransition();
  const { deleteElements } = useReactFlow();

  // 拖动起点位置（用于撤销摆放）
  const dragStart = useRef<Map<string, { x: number; y: number }>>(new Map());
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
        提示：把鼠标移到人物卡的小圆点上，从一个人拖到另一个人即可连线（绿色高亮表示可连接）；点中连线后按 Delete/Backspace 或上方按钮删除。
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

export function PowerMapFlow({
  partnerId,
  contacts,
  links,
}: {
  partnerId: string;
  contacts: PowerMapNodeContact[];
  links: PowerMapLink[];
}) {
  if (!contacts.length) return null;
  return (
    <div>
      <div className="mb-3 rounded-lg bg-zinc-50/80 border border-zinc-100 px-4 py-3">
        <PowerMapLegend />
      </div>
      <ReactFlowProvider>
        <FlowInner partnerId={partnerId} contacts={contacts} links={links} />
      </ReactFlowProvider>
    </div>
  );
}
