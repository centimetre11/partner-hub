"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { Partner, User } from "@prisma/client";
import { PartnerFrameworkMap } from "@/components/partner-framework-map";
import { MapNodeQuickEdit } from "@/components/map-node-quick-edit";
import {
  WORKSPACE_PANELS,
  panelForNode,
  type FrameworkMapNode,
  type WorkspacePanelId,
} from "@/lib/partner-framework";

function panelBadge(nodes: FrameworkMapNode[], panelId: WorkspacePanelId) {
  const related = nodes.filter((n) => panelForNode(n.id) === panelId);
  if (related.length === 0) return null;
  const missing = related.filter((n) => n.status === "missing").length;
  const partial = related.filter((n) => n.status === "partial").length;
  if (missing > 0) return { tone: "bg-amber-100 text-amber-800", text: `${missing} 待补` };
  if (partial > 0) return { tone: "bg-amber-50 text-amber-700", text: "部分" };
  return { tone: "bg-emerald-50 text-emerald-700", text: "就绪" };
}

export function PartnerWorkspaceShell({
  mapNodes,
  partner,
  users,
  pipelineStages,
  guide,
  positioning,
  pipeline,
  capability,
  relationship,
}: {
  mapNodes: FrameworkMapNode[];
  partner: Partner;
  users: User[];
  pipelineStages: { stage: number; name: string }[];
  guide: ReactNode;
  positioning: ReactNode;
  pipeline: ReactNode;
  capability: ReactNode;
  relationship: ReactNode;
}) {
  const [activePanel, setActivePanel] = useState<WorkspacePanelId>("guide");
  const [mapOpen, setMapOpen] = useState(false);
  const [editNode, setEditNode] = useState<FrameworkMapNode | null>(null);

  const panels: Record<WorkspacePanelId, ReactNode> = {
    guide,
    positioning,
    pipeline,
    capability,
    relationship,
  };

  const badges = useMemo(
    () => Object.fromEntries(WORKSPACE_PANELS.map((p) => [p.id, panelBadge(mapNodes, p.id)])) as Record<
      WorkspacePanelId,
      ReturnType<typeof panelBadge>
    >,
    [mapNodes],
  );

  const handleNodeClick = useCallback((node: FrameworkMapNode) => {
    const panel = node.panel ?? panelForNode(node.id);
    setActivePanel(panel);
    if (node.editable) setEditNode(node);
  }, []);

  const activeMeta = WORKSPACE_PANELS.find((p) => p.id === activePanel)!;

  return (
    <div className="px-8 pt-5 pb-16">
      {/* 主导航：五个工作区 */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-zinc-500">点击模块进入对应工作区；地图节点同步切换，不再向下滚动。</p>
          <Link href="/framework" className="text-xs text-indigo-600 hover:underline shrink-0">
            经营框架说明 →
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          {WORKSPACE_PANELS.map((p) => {
            const active = activePanel === p.id;
            const badge = badges[p.id];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePanel(p.id)}
                className={`rounded-xl border px-4 py-3 text-left transition-all ${
                  active
                    ? "border-indigo-500 bg-indigo-600 text-white shadow-md shadow-indigo-200"
                    : "border-zinc-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-semibold ${active ? "text-white" : "text-zinc-900"}`}>{p.label}</span>
                  {badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                        active ? "bg-white/20 text-white" : badge.tone
                      }`}
                    >
                      {badge.text}
                    </span>
                  )}
                </div>
                <p className={`text-[11px] mt-1 line-clamp-1 ${active ? "text-indigo-100" : "text-zinc-400"}`}>
                  {p.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 可折叠实例地图 */}
      <div className="mb-5">
        <button
          type="button"
          onClick={() => setMapOpen((v) => !v)}
          className="flex items-center gap-2 text-xs text-zinc-500 hover:text-indigo-600 mb-2"
        >
          <span className={`transition-transform ${mapOpen ? "rotate-90" : ""}`}>▸</span>
          实例地图（点击节点切换工作区{badgeSummary(mapNodes)}）
        </button>
        {mapOpen && (
          <PartnerFrameworkMap
            nodes={mapNodes.map((n) => ({
              ...n,
              status:
                (n.panel ?? panelForNode(n.id)) === activePanel && n.status !== "info"
                  ? n.status === "current"
                    ? "current"
                    : n.status
                  : n.status === "current"
                    ? "done"
                    : n.status,
            }))}
            compact
            interactive
            legend
            onNodeClick={handleNodeClick}
          />
        )}
      </div>

      {/* 当前工作区内容 */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
          <h2 className="text-base font-semibold text-zinc-900">{activeMeta.label}</h2>
          <p className="text-sm text-zinc-500 mt-0.5">{activeMeta.desc}</p>
        </div>
        <div className="p-6">{panels[activePanel]}</div>
      </div>

      {editNode && (
        <MapNodeQuickEdit
          node={editNode}
          partner={partner}
          users={users}
          pipelineStages={pipelineStages}
          onClose={() => setEditNode(null)}
        />
      )}
    </div>
  );
}

function badgeSummary(nodes: FrameworkMapNode[]) {
  const missing = nodes.filter((n) => n.status === "missing").length;
  return missing > 0 ? ` · ${missing} 项待补` : "";
}
