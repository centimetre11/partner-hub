"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { Partner, User } from "@prisma/client";
import { PartnerFrameworkMap } from "@/components/partner-framework-map";
import { MapNodeQuickEdit } from "@/components/map-node-quick-edit";
import {
  panelForNode,
  type FrameworkMapNode,
  type WorkspacePanelId,
} from "@/lib/partner-framework";
import { useLabels, useMessages } from "@/lib/i18n/context";

function panelBadge(
  nodes: FrameworkMapNode[],
  panelId: WorkspacePanelId,
  m: ReturnType<typeof useMessages>,
) {
  const related = nodes.filter((n) => panelForNode(n.id) === panelId);
  if (related.length === 0) return null;
  const missing = related.filter((n) => n.status === "missing").length;
  const partial = related.filter((n) => n.status === "partial").length;
  if (missing > 0) return { tone: "bg-amber-100 text-amber-800", text: m.workspace.toFill.replace("{n}", String(missing)) };
  if (partial > 0) return { tone: "bg-amber-50 text-amber-700", text: m.workspace.partial };
  return { tone: "bg-emerald-50 text-emerald-700", text: m.workspace.ready };
}

export function PartnerWorkspaceShell({
  mapNodes,
  partner,
  users,
  pipelineStages,
  taxonomy,
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
  taxonomy: import("@/components/map-node-quick-edit").TaxonomyOptionsMap;
  guide: ReactNode;
  positioning: ReactNode;
  pipeline: ReactNode;
  capability: ReactNode;
  relationship: ReactNode;
}) {
  const labels = useLabels();
  const m = useMessages();
  const workspacePanels = labels.workspacePanels;
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
    () =>
      Object.fromEntries(
        workspacePanels.map((p) => [p.id, panelBadge(mapNodes, p.id, m)]),
      ) as Record<WorkspacePanelId, ReturnType<typeof panelBadge>>,
    [mapNodes, m, workspacePanels],
  );

  const handleNodeClick = useCallback((node: FrameworkMapNode) => {
    const panel = node.panel ?? panelForNode(node.id);
    setActivePanel(panel);
    if (node.editable) setEditNode(node);
  }, []);

  const activeMeta = workspacePanels.find((p) => p.id === activePanel)!;
  const missingCount = mapNodes.filter((n) => n.status === "missing").length;

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-5 pb-12 sm:pb-16">
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate-500">{m.workspace.clickModule}</p>
          <Link href="/framework" className="text-xs text-sky-600 hover:underline shrink-0">
            {m.workspace.frameworkGuide}
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          {workspacePanels.map((p) => {
            const active = activePanel === p.id;
            const badge = badges[p.id];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePanel(p.id)}
                className={`rounded-lg border px-4 py-3 text-left ${
                  active
                    ? "border-slate-700 bg-slate-900 text-white border border-slate-300"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-semibold ${active ? "text-white" : "text-slate-900"}`}>{p.label}</span>
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
                <p className={`text-[11px] mt-1 line-clamp-1 ${active ? "text-slate-400" : "text-slate-400"}`}>
                  {p.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-5">
        <button
          type="button"
          onClick={() => setMapOpen((v) => !v)}
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-sky-600 mb-2"
        >
          <span className={mapOpen ? "rotate-90" : ""}>▸</span>
          {m.workspace.instanceMap}
          {missingCount > 0 ? m.workspace.itemsToFill.replace("{n}", String(missingCount)) : ")"}
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

      <div className="rounded-lg border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-base font-semibold text-slate-900">{activeMeta.label}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{activeMeta.desc}</p>
        </div>
        <div className="p-4 sm:p-6">{panels[activePanel]}</div>
      </div>

      {editNode && (
        <MapNodeQuickEdit
          node={editNode}
          partner={partner}
          users={users}
          pipelineStages={pipelineStages}
          taxonomy={taxonomy}
          onClose={() => setEditNode(null)}
        />
      )}
    </div>
  );
}
