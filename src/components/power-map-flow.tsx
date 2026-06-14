"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CONTACT_ROLE_CODES, CONTACT_ROLE_LABELS, attitudeLabel } from "@/lib/constants";
import { attitudeDotClass, PowerMapLegend, type PowerMapContact } from "@/components/power-map";
import {
  moveContactAction,
  setReportsToAction,
  addContactLinkAction,
  removeContactLinkAction,
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

// 节点数据载荷
type NodeData = { c: PowerMapContact };

// 自定义节点：复用权力地图卡片样式（左上角色代码、右上态度评分）
function ContactNode({ data }: NodeProps<Node<NodeData>>) {
  const c = data.c;
  return (
    <div className="relative">
      {/* 顶部：作为下级的连接点（上级连到这里） */}
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-zinc-400" />
      <span
        className="absolute -top-2 -left-2 w-5 h-5 rounded-sm bg-green-600 text-white text-[11px] font-bold flex items-center justify-center z-10"
        title={CONTACT_ROLE_LABELS[c.role] ?? c.role}
      >
        {CONTACT_ROLE_CODES[c.role] ?? "I"}
      </span>
      <span
        className={`absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center z-10 ${attitudeDotClass(c.attitude)}`}
        title={attitudeLabel(c.attitude)}
      >
        {c.attitude}
      </span>
      <div className="border border-zinc-400 bg-white px-4 py-2 min-w-[120px] text-center shadow-sm rounded">
        <div className="text-sm font-medium text-zinc-900 whitespace-nowrap">{c.name}</div>
        <div className="text-xs text-zinc-500 whitespace-nowrap">{c.department || c.title || "—"}</div>
      </div>
      {/* 底部：作为上级的连接点（从这里拖到下级） */}
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-zinc-400" />
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
      // 兜底防环
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
    const position =
      c.x != null && c.y != null ? { x: c.x, y: c.y } : fallback;
    return {
      id: c.id,
      type: "contact",
      position,
      data: { c },
    };
  });
}

function buildEdges(contacts: PowerMapNodeContact[], links: PowerMapLink[]): Edge[] {
  const ids = new Set(contacts.map((c) => c.id));
  const edges: Edge[] = [];
  const arrow = { type: MarkerType.ArrowClosed, color: "#a1a1aa" } as const;
  // 主汇报实线
  for (const c of contacts) {
    if (c.reportsToId && ids.has(c.reportsToId)) {
      edges.push({
        id: `r-${c.id}`,
        source: c.reportsToId,
        target: c.id,
        markerEnd: arrow,
        style: { stroke: "#a1a1aa" },
        data: { origin: "reportsTo", childId: c.id },
      });
    }
  }
  // 附加线（实线/虚线）
  for (const l of links) {
    if (!ids.has(l.subordinateId) || !ids.has(l.superiorId)) continue;
    const dotted = l.kind !== "SOLID";
    edges.push({
      id: `l-${l.id}`,
      source: l.superiorId,
      target: l.subordinateId,
      markerEnd: arrow,
      style: dotted
        ? { stroke: "#a1a1aa", strokeDasharray: "5 5" }
        : { stroke: "#a1a1aa" },
      data: { origin: "link", linkId: l.id },
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
  const [edges, setEdges] = useEdgesState<Edge>(buildEdges(contacts, links));
  const [lineMode, setLineMode] = useState<"SOLID" | "DOTTED">("SOLID");
  const [, startTransition] = useTransition();

  const sig = useMemo(() => signature(contacts, links), [contacts, links]);

  // 服务端数据变化（revalidate 后）同步到画布
  useEffect(() => {
    setNodes(buildNodes(contacts));
    setEdges(buildEdges(contacts, links));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<NodeData>>[]) => {
      onNodesChange(changes);
      for (const ch of changes) {
        if (ch.type === "position" && ch.dragging === false && ch.position) {
          const { x, y } = ch.position;
          startTransition(() => {
            void moveContactAction(partnerId, ch.id, x, y);
          });
        }
      }
    },
    [onNodesChange, partnerId],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      const superiorId = conn.source; // 上级（底部拖出）
      const subId = conn.target; // 下级（连到顶部）
      if (!superiorId || !subId || superiorId === subId) return;
      startTransition(() => {
        if (lineMode === "SOLID") {
          void setReportsToAction(partnerId, subId, superiorId);
        } else {
          void addContactLinkAction(partnerId, subId, superiorId, "DOTTED");
        }
      });
    },
    [partnerId, lineMode],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      startTransition(() => {
        for (const e of deleted) {
          const origin = (e.data as { origin?: string } | undefined)?.origin;
          if (origin === "reportsTo") {
            const childId = (e.data as { childId?: string }).childId;
            if (childId) void setReportsToAction(partnerId, childId, null);
          } else if (origin === "link") {
            const linkId = (e.data as { linkId?: string }).linkId;
            if (linkId) void removeContactLinkAction(partnerId, linkId);
          }
        }
      });
    },
    [partnerId],
  );

  const onResetLayout = useCallback(() => {
    startTransition(() => {
      void resetPowerMapLayoutAction(partnerId);
    });
  }, [partnerId]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
        <span className="text-zinc-400">连线类型：</span>
        <button
          type="button"
          onClick={() => setLineMode("SOLID")}
          className={`rounded-md px-2.5 py-1 border ${lineMode === "SOLID" ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}
        >
          实线 · 改主汇报
        </button>
        <button
          type="button"
          onClick={() => setLineMode("DOTTED")}
          className={`rounded-md px-2.5 py-1 border ${lineMode === "DOTTED" ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}
        >
          虚线 · 附加汇报
        </button>
        <span className="text-zinc-300">|</span>
        <button
          type="button"
          onClick={onResetLayout}
          className="rounded-md px-2.5 py-1 border border-zinc-200 text-zinc-600 hover:border-zinc-300"
        >
          重新自动排版
        </button>
        <span className="text-zinc-400 ml-1">提示：从一个人底部拖到另一人顶部建立汇报关系；选中连线按 Delete 删除。</span>
      </div>
      <div className="h-[460px] rounded-lg border border-zinc-100 bg-zinc-50/40">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
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
